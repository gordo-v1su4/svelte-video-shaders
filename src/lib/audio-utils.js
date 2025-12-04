export class AudioAnalyzer {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.audioElement = null;
        this.source = null;
        this.isAnalyzing = false;
        
        // Frequency ranges for bass, mid, treble
        this.bassRange = [20, 250];
        this.midRange = [250, 4000];
        this.trebleRange = [4000, 20000];
    }

    async initializeAudio(audioFile) {
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Create audio element
            this.audioElement = new Audio();
            this.audioElement.src = URL.createObjectURL(audioFile);
            this.audioElement.crossOrigin = 'anonymous';
            this.audioElement.loop = true;
            
            // Create analyser
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 512;
            this.analyser.smoothingTimeConstant = 0.8;
            
            // Create source and connect
            this.source = this.audioContext.createMediaElementSource(this.audioElement);
            this.source.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);
            
            // Initialize data array
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
            
            return true;
        } catch (error) {
            console.error('Failed to initialize audio:', error);
            return false;
        }
    }

    getFrequencyRange(startFreq, endFreq) {
        if (!this.dataArray || !this.analyser) return 0;
        
        const nyquist = this.audioContext.sampleRate / 2;
        const startBin = Math.floor((startFreq / nyquist) * this.analyser.frequencyBinCount);
        const endBin = Math.floor((endFreq / nyquist) * this.analyser.frequencyBinCount);
        
        let sum = 0;
        let count = 0;
        
        for (let i = startBin; i <= endBin && i < this.dataArray.length; i++) {
            sum += this.dataArray[i];
            count++;
        }
        
        return count > 0 ? (sum / count) / 255 : 0;
    }

    getAudioData() {
        if (!this.analyser || !this.dataArray) {
            return {
                audioLevel: 0,
                bassLevel: 0,
                midLevel: 0,
                trebleLevel: 0
            };
        }
        
        this.analyser.getByteFrequencyData(this.dataArray);
        
        // Calculate overall audio level
        const audioLevel = this.dataArray.reduce((sum, value) => sum + value, 0) / (this.dataArray.length * 255);
        
        // Calculate frequency band levels
        const bassLevel = this.getFrequencyRange(this.bassRange[0], this.bassRange[1]);
        const midLevel = this.getFrequencyRange(this.midRange[0], this.midRange[1]);
        const trebleLevel = this.getFrequencyRange(this.trebleRange[0], this.trebleRange[1]);
        
        return {
            audioLevel,
            bassLevel,
            midLevel,
            trebleLevel
        };
    }

    play() {
        if (this.audioElement && this.audioContext) {
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            this.audioElement.play();
            this.isAnalyzing = true;
        }
    }

    pause() {
        if (this.audioElement) {
            this.audioElement.pause();
            this.isAnalyzing = false;
        }
    }

    stop() {
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.currentTime = 0;
            this.isAnalyzing = false;
        }
    }

    setVolume(volume) {
        if (this.audioElement) {
            this.audioElement.volume = Math.max(0, Math.min(1, volume));
        }
    }

    getCurrentTime() {
        return this.audioElement?.currentTime || 0;
    }

    getDuration() {
        return this.audioElement?.duration || 0;
    }

    seekTo(time) {
        if (this.audioElement) {
            this.audioElement.currentTime = Math.max(0, Math.min(time, this.getDuration()));
        }
    }

    destroy() {
        this.stop();
        if (this.source) {
            this.source.disconnect();
        }
        if (this.analyser) {
            this.analyser.disconnect();
        }
        if (this.audioContext) {
            this.audioContext.close();
        }
        if (this.audioElement && this.audioElement.src) {
            URL.revokeObjectURL(this.audioElement.src);
        }
    }
}
