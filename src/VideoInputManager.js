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
        this.cameraSelector = null;
        this.fileInput = null;
        this.fileButton = null;
        this.availableDevices = [];
        this.currentDeviceId = null;
        this.currentVideoFile = null;
    }

    async init() {
        this.cameraSelector = document.getElementById('camera-selector');
        this.fileInput = document.getElementById('video-file');
        this.fileButton = document.getElementById('video-file-button');

        if (!this.cameraSelector || !this.fileInput || !this.fileButton) {
            console.error('[VIDEO] UI elements not found');
            return;
        }

        // Setup camera selector change handler
        this.cameraSelector.addEventListener('change', (e) => {
            this.handleCameraChange(e.target.value);
        });

        // Setup file button click handler
        this.fileButton.addEventListener('click', () => {
            this.fileInput.click();
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

        // Load available video devices
        await this.updateDeviceList();

        // Listen for device changes (USB cameras being connected/disconnected)
        navigator.mediaDevices.addEventListener('devicechange', () => {
            console.log('[VIDEO] Device change detected, refreshing device list...');
            this.updateDeviceList();
        });

        console.log('[VIDEO] Video input manager initialized');
    }

    async updateDeviceList() {
        try {
            // Request permission first (needed for device labels)
            // Try with different constraints to better detect USB cameras
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { 
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    } 
                });
                // Stop the stream immediately, we just needed permission
                stream.getTracks().forEach(track => track.stop());
                console.log('[VIDEO] Permission granted');
            } catch (e) {
                console.log('[VIDEO] Permission request failed, will use device IDs only:', e.message);
            }

            // Wait a bit for devices to be ready (especially USB devices)
            await new Promise(resolve => setTimeout(resolve, 500));

            // Enumerate all devices
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.availableDevices = devices.filter(device => device.kind === 'videoinput');

            console.log(`[VIDEO] Found ${this.availableDevices.length} camera devices:`);
            this.availableDevices.forEach((device, index) => {
                const label = device.label || `Camera ${index + 1}`;
                const deviceIdShort = device.deviceId.length > 20 ? device.deviceId.substring(0, 20) + '...' : device.deviceId;
                console.log(`[VIDEO]   [${index}] ${label}`);
                console.log(`[VIDEO]       ID: ${deviceIdShort}`);
                
                // Check for Logitech
                if (label.toLowerCase().includes('logitech')) {
                    console.log(`[VIDEO]       ✓ Logitech camera detected!`);
                }
            });

            // Update camera selector
            this.updateCameraSelector();

        } catch (error) {
            console.error('[VIDEO] Error enumerating devices:', error);
            this.updateCameraSelector();
        }
    }

    updateCameraSelector() {
        if (!this.cameraSelector) return;

        // Clear selector
        this.cameraSelector.innerHTML = '';

        // Add "None" option
        const noneOption = document.createElement('option');
        noneOption.value = 'none';
        noneOption.textContent = 'None';
        this.cameraSelector.appendChild(noneOption);

        // Add available camera devices
        if (this.availableDevices.length > 0) {
            this.availableDevices.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                const label = device.label || `Camera ${index + 1}`;
                // Highlight Logitech cameras
                const displayName = label.toLowerCase().includes('logitech') 
                    ? `📷 ${label} (USB)` 
                    : `${index + 1}: ${label}`;
                option.textContent = displayName;
                this.cameraSelector.appendChild(option);
            });
        } else {
            // Fallback: single "Default" option
            const defaultOption = document.createElement('option');
            defaultOption.value = 'default';
            defaultOption.textContent = 'Default Camera';
            this.cameraSelector.appendChild(defaultOption);
        }

        // Select current device if exists
        if (this.currentDeviceId) {
            this.cameraSelector.value = this.currentDeviceId;
        } else {
            this.cameraSelector.value = 'none';
        }
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
                } else {
                    console.warn('[VIDEO] Dropped file is not a video:', file.type);
                }
            }
        });
    }

    async handleCameraChange(deviceIdOrNone) {
        // Stop current video/camera
        this.stopCurrentVideo();
        this.currentVideoFile = null;

        if (deviceIdOrNone === 'none') {
            this.currentSource = 'none';
            this.currentDeviceId = null;
            this.onVideoReady(null);
            console.log('[VIDEO] Camera disabled');
        } else if (deviceIdOrNone === 'default') {
            // Fallback: use default webcam
            this.currentSource = 'camera';
            this.currentDeviceId = null;
            await this.startWebcam(null);
        } else {
            // deviceIdOrNone is a device ID
            this.currentSource = 'camera';
            this.currentDeviceId = deviceIdOrNone;
            await this.startWebcam(deviceIdOrNone);
        }
    }

    async startWebcam(deviceId = null) {
        try {
            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user' // Prefer front-facing cameras
                }
            };

            // If deviceId is provided, use it (for USB cameras like Logitech)
            if (deviceId) {
                constraints.video.deviceId = { exact: deviceId };
                const device = this.availableDevices.find(d => d.deviceId === deviceId);
                const deviceName = device ? device.label : deviceId.substring(0, 20);
                console.log(`[VIDEO] Starting camera: ${deviceName}`);
                
                // Remove facingMode when using specific device ID
                delete constraints.video.facingMode;
            } else {
                console.log('[VIDEO] Starting default webcam');
            }

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);

            this.createVideoElement();
            this.videoElement.srcObject = this.stream;
            this.videoElement.play();

            const device = this.availableDevices.find(d => d.deviceId === deviceId);
            const deviceName = device ? device.label : 'Default Camera';
            console.log(`[VIDEO] Camera started successfully: ${deviceName}`);
        } catch (error) {
            console.error('[VIDEO] Error accessing camera:', error);
            console.error('[VIDEO] Error details:', {
                name: error.name,
                message: error.message,
                constraint: error.constraint
            });
            
            // Try to refresh device list and retry
            if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                console.log('[VIDEO] Device not found, refreshing device list...');
                await this.updateDeviceList();
            }
            
            alert(`Could not access camera: ${error.message}. Please check permissions and ensure the camera is connected.`);
            if (this.cameraSelector) {
                this.cameraSelector.value = 'none';
            }
            this.currentDeviceId = null;
            this.currentSource = 'none';
        }
    }

    loadVideoFile(file) {
        // Stop current camera if active
        this.stopCurrentVideo();
        this.currentDeviceId = null;
        
        // Update camera selector to "none"
        if (this.cameraSelector) {
            this.cameraSelector.value = 'none';
        }

        this.currentSource = 'file';
        this.currentVideoFile = file;

        const url = URL.createObjectURL(file);
        this.createVideoElement();
        this.videoElement.src = url;
        this.videoElement.loop = true;
        this.videoElement.play();

        // Update button text
        if (this.fileButton) {
            this.fileButton.textContent = `📹 ${file.name.substring(0, 30)}${file.name.length > 30 ? '...' : ''}`;
        }

        console.log('[VIDEO] Video file loaded:', file.name, `(${(file.size / 1024 / 1024).toFixed(2)} MB)`);
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

    // Public method to get current selector (for compatibility)
    get selector() {
        return this.cameraSelector;
    }
}
