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
        this.refreshButton = document.getElementById('refresh-cameras-button');

        if (!this.cameraSelector || !this.fileInput || !this.fileButton) {
            console.error('[VIDEO] UI elements not found');
            return;
        }

        // Setup camera selector change handler
        this.cameraSelector.addEventListener('change', (e) => {
            this.handleCameraChange(e.target.value);
        });

        // Setup refresh button
        if (this.refreshButton) {
            this.refreshButton.addEventListener('click', async () => {
                console.log('[VIDEO] Manual camera refresh triggered');
                this.refreshButton.textContent = '🔄 Refreshing...';
                this.refreshButton.disabled = true;
                await this.updateDeviceList();
                this.refreshButton.textContent = '🔄 Refresh Cameras';
                this.refreshButton.disabled = false;
            });
        }

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
            console.log('[VIDEO] Starting device enumeration...');
            
            // First, try to get permission with minimal constraints
            // This is needed to get device labels (especially for USB cameras)
            let permissionGranted = false;
            try {
                // Try with minimal constraints first
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: true  // Minimal constraint to get permission
                });
                stream.getTracks().forEach(track => track.stop());
                permissionGranted = true;
                console.log('[VIDEO] Permission granted');
            } catch (e) {
                console.warn('[VIDEO] Initial permission request failed:', e.message);
                // Try again with more specific constraints
                try {
                    const stream2 = await navigator.mediaDevices.getUserMedia({ 
                        video: {
                            width: { min: 320, ideal: 640 },
                            height: { min: 240, ideal: 480 }
                        } 
                    });
                    stream2.getTracks().forEach(track => track.stop());
                    permissionGranted = true;
                    console.log('[VIDEO] Permission granted on second attempt');
                } catch (e2) {
                    console.warn('[VIDEO] Permission request failed, will use device IDs only:', e2.message);
                }
            }

            // Wait longer for USB devices to initialize
            console.log('[VIDEO] Waiting for USB devices to initialize...');
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Enumerate all devices multiple times to catch USB devices
            let devices = [];
            let attempts = 3;
            
            for (let i = 0; i < attempts; i++) {
                try {
                    const enumeratedDevices = await navigator.mediaDevices.enumerateDevices();
                    const videoDevices = enumeratedDevices.filter(device => device.kind === 'videoinput');
                    
                    // Merge with existing devices, prefer devices with labels
                    videoDevices.forEach(newDevice => {
                        const existing = devices.find(d => d.deviceId === newDevice.deviceId);
                        if (!existing) {
                            devices.push(newDevice);
                        } else if (newDevice.label && !existing.label) {
                            // Update existing device with label if we got one
                            existing.label = newDevice.label;
                        }
                    });
                    
                    if (i < attempts - 1) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                } catch (error) {
                    console.warn(`[VIDEO] Enumeration attempt ${i + 1} failed:`, error);
                }
            }

            this.availableDevices = devices;

            console.log(`[VIDEO] Found ${this.availableDevices.length} camera device(s):`);
            if (this.availableDevices.length === 0) {
                console.warn('[VIDEO] ⚠ No cameras found! Make sure your USB camera is connected and try refreshing the page.');
            } else {
                this.availableDevices.forEach((device, index) => {
                    const label = device.label || `Camera ${index + 1} (no label)`;
                    const deviceIdShort = device.deviceId.length > 30 ? device.deviceId.substring(0, 30) + '...' : device.deviceId;
                    console.log(`[VIDEO]   [${index}] ${label}`);
                    console.log(`[VIDEO]       ID: ${deviceIdShort}`);
                    
                    // Check for external/USB cameras
                    const lowerLabel = label.toLowerCase();
                    if (lowerLabel.includes('logitech')) {
                        console.log(`[VIDEO]       ✓ Logitech USB camera detected!`);
                    } else if (lowerLabel.includes('usb') || lowerLabel.includes('external')) {
                        console.log(`[VIDEO]       ✓ USB/External camera detected!`);
                    } else if (!lowerLabel.includes('integrated') && !lowerLabel.includes('built-in') && !lowerLabel.includes('front') && !lowerLabel.includes('back')) {
                        console.log(`[VIDEO]       ? Possibly external camera`);
                    }
                });
            }

            // Update camera selector
            this.updateCameraSelector();

        } catch (error) {
            console.error('[VIDEO] Error enumerating devices:', error);
            console.error('[VIDEO] Error details:', error.name, error.message);
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
                const lowerLabel = label.toLowerCase();
                
                // Highlight external/USB cameras
                let displayName;
                if (lowerLabel.includes('logitech')) {
                    displayName = `📷 ${label} (USB)`;
                } else if (lowerLabel.includes('usb') || lowerLabel.includes('external')) {
                    displayName = `📷 ${label} (USB)`;
                } else if (!lowerLabel.includes('integrated') && !lowerLabel.includes('built-in') && !lowerLabel.includes('front') && !lowerLabel.includes('back')) {
                    displayName = `📷 ${label} (External?)`;
                } else {
                    displayName = `${index + 1}: ${label}`;
                }
                
                option.textContent = displayName;
                this.cameraSelector.appendChild(option);
            });
        } else {
            // No devices found - add refresh option
            const noDevicesOption = document.createElement('option');
            noDevicesOption.value = 'none';
            noDevicesOption.textContent = 'No cameras found - Click to refresh';
            this.cameraSelector.appendChild(noDevicesOption);
            
            // Add refresh button functionality
            this.cameraSelector.addEventListener('click', async () => {
                if (this.cameraSelector.value === 'none' && this.availableDevices.length === 0) {
                    console.log('[VIDEO] Manual refresh triggered');
                    await this.updateDeviceList();
                }
            }, { once: true });
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
            let constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };

            // If deviceId is provided, use it (for USB cameras like Logitech)
            if (deviceId && deviceId !== 'default') {
                constraints.video.deviceId = { exact: deviceId };
                const device = this.availableDevices.find(d => d.deviceId === deviceId);
                const deviceName = device ? device.label : deviceId.substring(0, 20);
                console.log(`[VIDEO] Starting camera: ${deviceName}`);
            } else {
                console.log('[VIDEO] Starting default webcam');
                // For default, try to avoid integrated cameras if USB cameras are available
                const usbCameras = this.availableDevices.filter(d => {
                    const label = (d.label || '').toLowerCase();
                    return label.includes('usb') || label.includes('logitech') || label.includes('external');
                });
                if (usbCameras.length > 0) {
                    console.log('[VIDEO] USB cameras available, but using default. Consider selecting specific camera.');
                }
            }

            // Try to start the camera
            console.log('[VIDEO] Requesting camera access with constraints:', JSON.stringify(constraints));
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
            
            // Try different approaches based on error type
            if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
                console.log('[VIDEO] Device not found, refreshing device list and retrying...');
                await this.updateDeviceList();
                
                // If we have a deviceId, try again with updated list
                if (deviceId && deviceId !== 'default') {
                    const deviceStillExists = this.availableDevices.find(d => d.deviceId === deviceId);
                    if (deviceStillExists) {
                        console.log('[VIDEO] Device found in updated list, retrying...');
                        // Retry once more
                        try {
                            const retryConstraints = {
                                video: {
                                    deviceId: { exact: deviceId },
                                    width: { ideal: 1280 },
                                    height: { ideal: 720 }
                                }
                            };
                            this.stream = await navigator.mediaDevices.getUserMedia(retryConstraints);
                            // If successful, continue with normal flow
                            this.createVideoElement();
                            this.videoElement.srcObject = this.stream;
                            this.videoElement.play();
                            const device = this.availableDevices.find(d => d.deviceId === deviceId);
                            const deviceName = device ? device.label : 'Camera';
                            console.log(`[VIDEO] Camera started successfully after retry: ${deviceName}`);
                            return;
                        } catch (retryError) {
                            console.error('[VIDEO] Retry also failed:', retryError);
                        }
                    }
                }
            } else if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                alert('Camera permission denied. Please allow camera access in your browser settings and refresh the page.');
            } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
                alert(`Camera is being used by another application. Please close other apps using the camera and try again.\n\nError: ${error.message}`);
            } else {
                alert(`Could not access camera: ${error.message}\n\nPlease ensure:\n- Camera is connected via USB\n- No other application is using the camera\n- Browser has camera permissions\n- Try refreshing the page`);
            }
            
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
