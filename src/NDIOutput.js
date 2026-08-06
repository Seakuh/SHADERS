// ============================================
// NDI Output
// ============================================
// Captures the rendered canvas and streams raw RGBA frames to the local
// bridge, which hands them to the NDI SDK. Readback uses WebGL2 pixel
// buffer objects with fences so the GPU is never stalled waiting on the
// CPU: frames are collected one or two frames late, which is invisible in
// a video feed but keeps the render loop at full rate.

export const FRAME_MAGIC = 0x4e444946; // "NDIF"
export const FRAME_HEADER_BYTES = 32;

const MAX_PENDING_READS = 3;
// Stop queueing frames when the socket is congested; a backed-up buffer adds
// latency without adding frames.
const MAX_BUFFERED_BYTES = 24 * 1024 * 1024;

export class NDIOutput {
    /**
     * @param {THREE.WebGLRenderer} threeRenderer
     * @param {{ sendBinary: (buf: ArrayBuffer) => boolean, bufferedAmount: number }} transport
     */
    constructor(threeRenderer, transport, options = {}) {
        this.threeRenderer = threeRenderer;
        this.transport = transport;
        this.log = options.log || (() => {});

        this.enabled = false;
        this.fps = options.fps || 30;
        this.width = options.width || 1280;
        this.height = options.height || 720;
        // Defaults to the fixed resolution above, matching the first entry of
        // the resolution picker in index.html.
        this.autoResolution = options.autoResolution === true;

        this.gl = null;
        this.isWebGL2 = false;
        // Two stages: `resolve` takes the (possibly multisampled) default
        // framebuffer down to a single sample at its own size, `output` scales
        // and flips it. See queueRead() for why this cannot be one step.
        this.resolve = null;
        this.output = null;

        this.pending = [];      // { pbo, sync, width, height, bytes }
        this.freeBuffers = [];  // recycled PBOs
        this.lastCaptureTime = 0;
        this.framesSent = 0;
        this.framesDropped = 0;
        this.unsupportedReason = null;

        this.statusElement = null;
    }

    init() {
        this.statusElement = document.getElementById('ndi-status');
        const gl = this.threeRenderer.getContext();
        this.gl = gl;
        this.isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
        if (!this.isWebGL2) {
            this.unsupportedReason = 'WebGL2 required for NDI capture';
            this.log(this.unsupportedReason);
        }
        this.setStatus();
    }

    get available() {
        return this.isWebGL2;
    }

    setEnabled(enabled) {
        if (enabled && !this.isWebGL2) {
            this.log(`Cannot enable NDI: ${this.unsupportedReason}`);
            return false;
        }
        if (this.enabled === enabled) return enabled;
        this.enabled = enabled;
        if (!enabled) this.releasePending();
        this.log(`NDI output ${enabled ? 'enabled' : 'disabled'}`);
        this.setStatus();
        return enabled;
    }

    setFps(fps) {
        this.fps = Math.min(60, Math.max(1, fps));
        this.setStatus();
    }

    setResolution(width, height) {
        // NDI requires even dimensions for most downstream codecs.
        this.width = Math.max(2, Math.round(width / 2) * 2);
        this.height = Math.max(2, Math.round(height / 2) * 2);
        this.autoResolution = false;
        this.setStatus();
    }

    setAutoResolution(auto) {
        this.autoResolution = auto;
        this.setStatus();
    }

    /**
     * Called once per frame immediately after the scene has been rendered,
     * while the default framebuffer still holds this frame's pixels.
     */
    capture() {
        if (!this.enabled || !this.isWebGL2) return;

        this.collectCompleted();

        const now = performance.now();
        const interval = 1000 / this.fps;
        if (now - this.lastCaptureTime < interval) return;

        if (this.pending.length >= MAX_PENDING_READS) {
            this.framesDropped++;
            return;
        }
        if (this.transport.bufferedAmount > MAX_BUFFERED_BYTES) {
            this.framesDropped++;
            return;
        }

        this.lastCaptureTime = now;
        this.queueRead();
    }

    queueRead() {
        const gl = this.gl;
        const canvas = gl.canvas;
        const srcWidth = canvas.width;
        const srcHeight = canvas.height;
        if (srcWidth === 0 || srcHeight === 0) return;

        let outWidth = this.width;
        let outHeight = this.height;
        if (this.autoResolution) {
            outWidth = Math.max(2, Math.round(srcWidth / 2) * 2);
            outHeight = Math.max(2, Math.round(srcHeight / 2) * 2);
        }

        if (!this.ensureTarget('resolve', srcWidth, srcHeight)) return;
        if (!this.ensureTarget('output', outWidth, outHeight)) return;

        const prevFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);

        // Stage 1 — resolve. The renderer is created with antialias: true, so
        // the default framebuffer is multisampled. Blitting out of a
        // multisampled buffer is only legal at identical dimensions with
        // NEAREST filtering; scaling or mirroring here raises
        // INVALID_OPERATION and silently yields a black frame.
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.resolve.framebuffer);
        gl.blitFramebuffer(
            0, 0, srcWidth, srcHeight,
            0, 0, srcWidth, srcHeight,
            gl.COLOR_BUFFER_BIT, gl.NEAREST
        );

        // Stage 2 — scale and flip, now that both sides are single-sampled.
        // Reversing the source Y range converts OpenGL's bottom-up layout into
        // the top-down layout NDI expects, for free, on the GPU.
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.resolve.framebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.output.framebuffer);
        gl.blitFramebuffer(
            0, srcHeight, srcWidth, 0,
            0, 0, outWidth, outHeight,
            gl.COLOR_BUFFER_BIT, gl.LINEAR
        );

        const bytes = outWidth * outHeight * 4;
        const pbo = this.acquireBuffer(bytes);

        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.output.framebuffer);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo.buffer);
        gl.readPixels(0, 0, outWidth, outHeight, gl.RGBA, gl.UNSIGNED_BYTE, 0);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();

        // Restore the binding three.js believes is active. Binding the generic
        // FRAMEBUFFER target resets both READ and DRAW at once.
        gl.bindFramebuffer(gl.FRAMEBUFFER, prevFramebuffer);

        this.pending.push({ pbo, sync, width: outWidth, height: outHeight, bytes });
    }

    collectCompleted() {
        const gl = this.gl;
        while (this.pending.length > 0) {
            const entry = this.pending[0];
            const status = gl.clientWaitSync(entry.sync, 0, 0);
            if (status === gl.TIMEOUT_EXPIRED) return;   // still rendering, try next frame

            this.pending.shift();
            gl.deleteSync(entry.sync);

            if (status === gl.WAIT_FAILED) {
                this.releaseBuffer(entry.pbo);
                this.framesDropped++;
                continue;
            }

            const frame = new ArrayBuffer(FRAME_HEADER_BYTES + entry.bytes);
            const header = new DataView(frame, 0, FRAME_HEADER_BYTES);
            header.setUint32(0, FRAME_MAGIC, true);
            header.setUint32(4, entry.width, true);
            header.setUint32(8, entry.height, true);
            header.setUint32(12, entry.width * 4, true);   // line stride
            header.setUint32(16, Math.round(this.fps * 1000), true);  // frame rate numerator
            header.setUint32(20, 1000, true);                          // frame rate denominator
            header.setUint32(24, 0, true);   // reserved
            header.setUint32(28, 0, true);   // reserved

            const pixels = new Uint8Array(frame, FRAME_HEADER_BYTES, entry.bytes);
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, entry.pbo.buffer);
            gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels);
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);

            this.releaseBuffer(entry.pbo);

            if (this.transport.sendBinary(frame)) {
                this.framesSent++;
            } else {
                this.framesDropped++;
            }
            this.setStatus();
        }
    }

    /** Lazily (re)allocate one of the single-sample blit targets. */
    ensureTarget(slot, width, height) {
        const gl = this.gl;
        const existing = this[slot];
        if (existing && existing.width === width && existing.height === height) return true;

        this.destroyTarget(slot);

        const framebuffer = gl.createFramebuffer();
        const renderbuffer = gl.createRenderbuffer();
        const prevFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        const prevRenderbuffer = gl.getParameter(gl.RENDERBUFFER_BINDING);

        gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, width, height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, renderbuffer);

        const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;

        gl.bindRenderbuffer(gl.RENDERBUFFER, prevRenderbuffer);
        gl.bindFramebuffer(gl.FRAMEBUFFER, prevFramebuffer);

        if (!complete) {
            gl.deleteFramebuffer(framebuffer);
            gl.deleteRenderbuffer(renderbuffer);
            this.unsupportedReason = `NDI ${slot} framebuffer incomplete`;
            this.log(this.unsupportedReason);
            this.enabled = false;
            this.setStatus();
            return false;
        }

        this[slot] = { framebuffer, renderbuffer, width, height };
        return true;
    }

    acquireBuffer(bytes) {
        const gl = this.gl;
        const index = this.freeBuffers.findIndex(b => b.bytes === bytes);
        if (index !== -1) return this.freeBuffers.splice(index, 1)[0];

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
        gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        return { buffer, bytes };
    }

    releaseBuffer(pbo) {
        if (this.freeBuffers.length < MAX_PENDING_READS + 1) {
            this.freeBuffers.push(pbo);
        } else {
            this.gl.deleteBuffer(pbo.buffer);
        }
    }

    releasePending() {
        const gl = this.gl;
        for (const entry of this.pending) {
            gl.deleteSync(entry.sync);
            gl.deleteBuffer(entry.pbo.buffer);
        }
        this.pending = [];
        for (const pbo of this.freeBuffers) gl.deleteBuffer(pbo.buffer);
        this.freeBuffers = [];
    }

    destroyTarget(slot) {
        const gl = this.gl;
        const target = this[slot];
        if (!target) return;
        gl.deleteFramebuffer(target.framebuffer);
        gl.deleteRenderbuffer(target.renderbuffer);
        this[slot] = null;
    }

    setStatus() {
        if (!this.statusElement) return;
        if (!this.isWebGL2) {
            this.statusElement.textContent = 'unavailable';
            return;
        }
        if (!this.enabled) {
            this.statusElement.textContent = 'off';
            return;
        }
        const res = this.output
            ? `${this.output.width}x${this.output.height}`
            : `${this.width}x${this.height}`;
        this.statusElement.textContent = `${res} @${this.fps} · ${this.framesSent} sent`;
    }
}
