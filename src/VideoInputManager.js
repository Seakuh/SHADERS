import * as THREE from 'three';

// ============================================
// Video Input Manager
// ============================================
export class VideoInputManager {
    constructor(onVideoReady) {
        this.onVideoReady = onVideoReady;
        this.videoElement = null;
        this.videoTexture = null;
        this.stream = null;
        this.currentSource = 'none';
        this.selector = null;
        this.fileInput = null;
    }

    init() {
        this.selector = document.getElementById('video-selector');
        this.fileInput = document.getElementById('video-file');

        if (!this.selector || !this.fileInput) {
            console.error('Video UI elements not found');
            return;
        }

        // Setup selector change handler
        this.selector.addEventListener('change', (e) => {
            this.handleSourceChange(e.target.value);
        });

        // Setup file input handler
        this.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.loadVideoFile(file);
            }
        });

        // Setup drag and drop
        this.setupDragAndDrop();

        console.log('[VIDEO] Video input manager initialized');
    }

    setupDragAndDrop() {
        const body = document.body;
        const preventDefaults = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };

        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            body.addEventListener(eventName, preventDefaults, false);
        });

        // Highlight drop area when item is dragged over it
        body.addEventListener('dragenter', (e) => {
            console.log('[VIDEO] Drag enter');
            body.style.backgroundColor = 'rgba(0, 100, 200, 0.3)';
        });

        body.addEventListener('dragover', (e) => {
            // Allow drop
            e.dataTransfer.dropEffect = 'copy';
        });

        body.addEventListener('dragleave', (e) => {
            console.log('[VIDEO] Drag leave');
            body.style.backgroundColor = '';
        });

        body.addEventListener('drop', (e) => {
            console.log('[VIDEO] Drop event');
            body.style.backgroundColor = '';

            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                console.log('[VIDEO] Dropped file:', file.name, file.type, `(${(file.size / 1024 / 1024).toFixed(2)} MB)`);

                // Check if it's a video file
                if (file.type.startsWith('video/')) {
                    console.log('[VIDEO] Loading video file via drag and drop...');
                    this.loadVideoFile(file);
                    // Update selector to show file is loaded
                    if (this.selector) {
                        this.selector.value = 'file';
                    }
                } else {
                    console.warn('[VIDEO] Dropped file is not a video:', file.type);
                }
            }
        });
    }

    async handleSourceChange(source) {
        this.currentSource = source;
        console.log(`[VIDEO] Switching to source: ${source}`);

        // Stop current stream
        this.stopCurrentVideo();

        switch (source) {
            case 'webcam':
                await this.startWebcam();
                break;
            case 'file':
                this.fileInput.click();
                break;
            case 'none':
                this.onVideoReady(null);
                break;
        }
    }

    async startWebcam() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            this.createVideoElement();
            this.videoElement.srcObject = this.stream;
            this.videoElement.play();

            console.log('[VIDEO] Webcam started successfully');
        } catch (error) {
            console.error('[VIDEO] Error accessing webcam:', error);
            alert('Could not access webcam. Please check permissions.');
            this.selector.value = 'none';
        }
    }

    loadVideoFile(file) {
        const url = URL.createObjectURL(file);
        this.createVideoElement();
        this.videoElement.src = url;
        this.videoElement.loop = true;
        this.videoElement.play();

        console.log('[VIDEO] Video file loaded:', file.name);
    }

    createVideoElement() {
        if (this.videoElement) {
            this.stopCurrentVideo();
        }

        this.videoElement = document.createElement('video');
        this.videoElement.id = 'video-preview';
        this.videoElement.autoplay = true;
        this.videoElement.muted = true;
        this.videoElement.playsInline = true;

        // Create THREE.js texture when video is ready
        this.videoElement.addEventListener('loadeddata', () => {
            console.log('[VIDEO] Video ready, creating texture');
            this.videoTexture = new THREE.VideoTexture(this.videoElement);
            this.videoTexture.minFilter = THREE.LinearFilter;
            this.videoTexture.magFilter = THREE.LinearFilter;
            this.videoTexture.format = THREE.RGBFormat;

            this.onVideoReady(this.videoTexture);
        });

        document.body.appendChild(this.videoElement);
    }

    stopCurrentVideo() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.srcObject = null;
            this.videoElement.src = '';
            if (this.videoElement.parentNode) {
                this.videoElement.parentNode.removeChild(this.videoElement);
            }
            this.videoElement = null;
        }

        if (this.videoTexture) {
            this.videoTexture.dispose();
            this.videoTexture = null;
        }

        console.log('[VIDEO] Stopped current video');
    }

    getTexture() {
        return this.videoTexture;
    }

    isActive() {
        return this.currentSource !== 'none' && this.videoTexture !== null;
    }
}
