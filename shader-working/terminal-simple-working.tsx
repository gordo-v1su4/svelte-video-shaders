import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const TerminalCRT = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const textureRef = useRef<THREE.CanvasTexture | null>(null);
  const planeRef = useRef<THREE.Mesh | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const [typingProgress, setTypingProgress] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [displayMode, setDisplayMode] = useState('text');
  const [uploadedImage, setUploadedImage] = useState<HTMLImageElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  // Simplified effect parameters
  const [effectParams, setEffectParams] = useState({
    distortion: 0.075,
    scanlineIntensity: 0.26,
    rgbShift: 0.0015,
    noise: 0.022,
    flickerIntensity: 0.011,
    trackingIntensity: 0.0,
    trackingSpeed: 1.2,
    trackingFreq: 8.0,
    waveAmplitude: 0.0,
    selectedFilter: 'crt'
  });

  // Filter presets
  const filterPresets = {
    crt: {
      distortion: 0.075,
      scanlineIntensity: 0.26,
      rgbShift: 0.0015,
      noise: 0.022,
      flickerIntensity: 0.011,
      trackingIntensity: 0.0,
      trackingSpeed: 1.2,
      trackingFreq: 8.0,
      waveAmplitude: 0.0
    },
    vhs: {
      distortion: 0.05,
      scanlineIntensity: 0.15,
      rgbShift: 0.006,
      noise: 0.05,
      flickerIntensity: 0.02,
      trackingIntensity: 0.003,
      trackingSpeed: 1.2,
      trackingFreq: 8.0,
      waveAmplitude: 0.002
    },
    glitch: {
      distortion: 0.05,
      scanlineIntensity: 0.1,
      rgbShift: 0.008,
      noise: 0.03,
      flickerIntensity: 0.03,
      trackingIntensity: 0.005,
      trackingSpeed: 2.0,
      trackingFreq: 12.0,
      waveAmplitude: 0.005
    }
  };

  // Terminal text content
  const terminalLines = [
    { text: 'Cell 4 idle', x: 77, y: 60, color: '#00FF00' },
    { text: 'Operation: none', x: 38, y: 93, color: '#AAAAAA' },
    { text: 'imageUrl: https://v3.fal.media/fi...', x: 38, y: 136, color: '#3A96DD' },
    { text: 'videoUrl: none', x: 38, y: 169, color: '#AAAAAA' },
    { text: 'composedVideoUrl: none', x: 38, y: 204, color: '#AAAAAA' },
    { text: 'dialogueUrl: none', x: 38, y: 238, color: '#AAAAAA' },
    { text: 'soundFxUrl: none', x: 38, y: 272, color: '#AAAAAA' }
  ];

  // Sample stock content URL
  const stockImageUrl = 'https://picsum.photos/400/300';

  // Total characters to type
  const totalChars = terminalLines.reduce((sum, line) => sum + line.text.length, 0);

  useEffect(() => {
    // Initialize Three.js scene
    const container = containerRef.current;
    if (!container) return;
    
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Create scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Create camera
    const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 1, 1000);
    (camera as any).position.z = 10;
    cameraRef.current = camera;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Create canvas for terminal content
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    canvasRef.current = canvas;
    ctxRef.current = ctx;
    
    // Initial canvas setup
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    
    // Create terminal border
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, width - 6, height - 6);
    
    // Add a header line
    ctx.fillStyle = '#111111';
    ctx.fillRect(3, 25, width - 6, 2);
    
    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    textureRef.current = texture;

    // Create material with shader
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform sampler2D tDiffuse;
      varying vec2 vUv;
      
      // Parameters
      uniform float time;
      uniform float distortion;
      uniform float scanlineIntensity;
      uniform float rgbShift;
      uniform float noise;
      uniform float flickerIntensity;
      uniform float trackingIntensity;
      uniform float trackingSpeed;
      uniform float trackingFreq;
      uniform float waveAmplitude;
      
      #define PI 3.14159265
      
      // Hash function for noise
      float hash(vec2 v) {
        return fract(sin(dot(v, vec2(89.44, 19.36))) * 22189.22);
      }
      
      // Interpolated hash for smoother noise
      float iHash(vec2 v, vec2 r) {
        float h00 = hash(floor(v * r + vec2(0.0, 0.0)) / r);
        float h10 = hash(floor(v * r + vec2(1.0, 0.0)) / r);
        float h01 = hash(floor(v * r + vec2(0.0, 1.0)) / r);
        float h11 = hash(floor(v * r + vec2(1.0, 1.0)) / r);
        vec2 ip = smoothstep(vec2(0.0), vec2(1.0), mod(v * r, 1.0));
        return (h00 * (1.0 - ip.x) + h10 * ip.x) * (1.0 - ip.y) + (h01 * (1.0 - ip.x) + h11 * ip.x) * ip.y;
      }
      
      // Multi-octave noise
      float vhsNoise(vec2 v) {
        float sum = 0.0;
        for(int i = 1; i < 5; i++) {
          sum += iHash(v + vec2(float(i)), vec2(2.0 * pow(2.0, float(i)))) / pow(2.0, float(i));
        }
        return sum;
      }
      
      // Simple random for basic effects
      float rand(vec2 co) {
        return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
      }
      
      void main() {
        vec2 uv = vUv;
        vec2 uvn = uv;
        
        // Apply barrel distortion
        vec2 cc = uv - 0.5;
        float dist = dot(cc, cc) * distortion;
        uv = uv + cc * (1.0 + dist) * dist;
        uvn = uv;
        
        // VHS Tape Wave
        if (waveAmplitude > 0.0) {
          uvn.x += (vhsNoise(vec2(uvn.y, time)) - 0.5) * 0.005 * waveAmplitude * 10.0;
          uvn.x += (vhsNoise(vec2(uvn.y * 100.0, time * 10.0)) - 0.5) * 0.01 * waveAmplitude * 10.0;
        }
        
        // VHS Tracking
        if (trackingIntensity > 0.0) {
          float tcPhase = clamp((sin(uvn.y * trackingFreq - time * PI * trackingSpeed) - 0.92) * vhsNoise(vec2(time)), 0.0, 0.01) * 10.0;
          float tcNoise = max(vhsNoise(vec2(uvn.y * 100.0, time * 10.0)) - 0.5, 0.0);
          uvn.x = uvn.x - tcNoise * tcPhase * trackingIntensity * 20.0;
        }
        
        // Check if uv is outside of texture bounds
        vec4 texel = vec4(0.0);
        if (uvn.x >= 0.0 && uvn.x <= 1.0 && uvn.y >= 0.0 && uvn.y <= 1.0) {
          texel = texture2D(tDiffuse, uvn);
        }
        
        // VHS tracking darkening
        if (trackingIntensity > 0.0) {
          float tcPhase = clamp((sin(uvn.y * trackingFreq - time * PI * trackingSpeed) - 0.92) * vhsNoise(vec2(time)), 0.0, 0.01) * 10.0;
          texel.rgb *= 1.0 - tcPhase * trackingIntensity * 5.0;
        }
        
        // Scanlines
        if (scanlineIntensity > 0.0) {
          float scanline = sin((vUv.y * 90.0 + time * 5.0) * 3.14159 * 2.0) * 0.5 + 0.5;
          texel.rgb *= 1.0 - scanlineIntensity + scanlineIntensity * scanline;
        }
        
        // RGB shift
        if (rgbShift > 0.0) {
          float r = texture2D(tDiffuse, vec2(uvn.x + rgbShift, uvn.y)).r;
          float g = texel.g;
          float b = texture2D(tDiffuse, vec2(uvn.x - rgbShift, uvn.y)).b;
          texel.rgb = vec3(r, g, b);
        }
        
        // Vignette
        float vignette = 1.0 - dot(cc, cc) * 1.3;
        texel.rgb *= vignette;
        
        // Random noise
        if (noise > 0.0) {
          float noiseVal = rand(uv + time) * noise * 2.0 - noise;
          texel.rgb += noiseVal;
        }
        
        // Flickering
        if (flickerIntensity > 0.0) {
          float flicker = sin(time * 20.0) * flickerIntensity + (1.0 - flickerIntensity);
          texel.rgb *= flicker;
        }
        
        // Clamp final color
        texel.rgb = clamp(texel.rgb, 0.0, 1.0);
        
        gl_FragColor = texel;
      }
    `;

    const uniforms = {
      tDiffuse: { value: texture },
      time: { value: 0 },
      distortion: { value: effectParams.distortion },
      scanlineIntensity: { value: effectParams.scanlineIntensity },
      rgbShift: { value: effectParams.rgbShift },
      noise: { value: effectParams.noise },
      flickerIntensity: { value: effectParams.flickerIntensity },
      trackingIntensity: { value: effectParams.trackingIntensity },
      trackingSpeed: { value: effectParams.trackingSpeed },
      trackingFreq: { value: effectParams.trackingFreq },
      waveAmplitude: { value: effectParams.waveAmplitude }
    };

    const material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      transparent: true
    });

    // Create plane for terminal
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material as any);
    scene.add(plane);
    planeRef.current = plane;

    // Animation loop
    let time = 0;
    const animate = () => {
      requestAnimationFrame(animate);
      time += 0.01;
      if (material.uniforms) {
        material.uniforms.time.value = time;
      }
      renderer.render(scene, camera);
    };
    animate();

    // Initial content draw
    setTimeout(() => {
      if (isInitialized) {
        redrawContent();
      }
    }, 100);

    // Handle resize
    const handleResize = () => {
      if (!container) return;
      
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      
      camera.left = -newWidth / 2;
      camera.right = newWidth / 2;
      camera.top = newHeight / 2;
      camera.bottom = -newHeight / 2;
      camera.updateProjectionMatrix();
      
      renderer.setSize(newWidth, newHeight);
      
      // Update canvas and texture
      if (canvasRef.current) {
        canvasRef.current.width = newWidth;
        canvasRef.current.height = newHeight;
        
        // Redraw content based on current mode
        redrawContent();
      }
    };
    
    window.addEventListener('resize', handleResize);
    setIsInitialized(true);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Update shader uniforms when effect parameters change
  useEffect(() => {
    if (isInitialized && planeRef.current && planeRef.current.material) {
      const material = planeRef.current.material as unknown as THREE.ShaderMaterial;
      if (material.uniforms) {
        material.uniforms.distortion.value = effectParams.distortion;
        material.uniforms.scanlineIntensity.value = effectParams.scanlineIntensity;
        material.uniforms.rgbShift.value = effectParams.rgbShift;
        material.uniforms.noise.value = effectParams.noise;
        material.uniforms.flickerIntensity.value = effectParams.flickerIntensity;
        material.uniforms.trackingIntensity.value = effectParams.trackingIntensity;
        material.uniforms.trackingSpeed.value = effectParams.trackingSpeed;
        material.uniforms.trackingFreq.value = effectParams.trackingFreq;
        material.uniforms.waveAmplitude.value = effectParams.waveAmplitude;
        
        // Force redraw when parameters change
        redrawContent();
      }
    }
  }, [effectParams, isInitialized]);

  // Update typing animation
  useEffect(() => {
    if (!isInitialized || displayMode !== 'text') return;
    
    const typingInterval = setInterval(() => {
      if (typingProgress < totalChars) {
        setTypingProgress(prev => prev + 1);
      } else {
        clearInterval(typingInterval);
      }
    }, 25);
    
    return () => clearInterval(typingInterval);
  }, [isInitialized, typingProgress, totalChars, displayMode]);

  // Reset typing on mode change
  useEffect(() => {
    if (displayMode === 'text') {
      setTypingProgress(0);
    }
    if (isInitialized) {
      redrawContent();
    }
  }, [displayMode, isInitialized]);

  // Redraw when image changes
  useEffect(() => {
    if (isInitialized && uploadedImage) {
      redrawContent();
    }
  }, [uploadedImage, isInitialized]);

  // Apply filter preset
  const applyFilterPreset = (presetName: string) => {
    if (filterPresets[presetName as keyof typeof filterPresets]) {
      setEffectParams({
        ...effectParams,
        ...filterPresets[presetName as keyof typeof filterPresets],
        selectedFilter: presetName
      });
    }
  };

  // Redraw content based on current display mode
  const redrawContent = () => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    const texture = textureRef.current;
    
    if (!ctx || !canvas || !texture) return;
    
    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw terminal border
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
    
    // Add a header line
    ctx.fillStyle = '#111111';
    ctx.fillRect(3, 25, canvas.width - 6, 2);
    
    // Draw mode-specific content
    if (displayMode === 'text') {
      drawTextMode(ctx, canvas, typingProgress);
    } else if (displayMode === 'image') {
      drawImageMode(ctx, canvas, uploadedImage);
    }
    
    // Update texture
    texture.needsUpdate = true;
  };

  // Draw terminal with typing effect
  const drawTextMode = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, progress: number) => {
    // Set font
    ctx.font = '16px monospace';
    
    // Track current progress
    let currentProgress = 0;
    
    // Draw each line with typing effect
    for (let i = 0; i < terminalLines.length; i++) {
      const line = terminalLines[i];
      const lineLength = line.text.length;
      
      if (currentProgress >= progress) {
        // Skip lines that haven't started typing yet
        break;
      }
      
      // Determine how much of this line to draw
      const charsToShow = Math.min(lineLength, progress - currentProgress);
      const textToShow = line.text.substring(0, charsToShow);
      
      // Draw the text
      ctx.fillStyle = line.color;
      ctx.fillText(textToShow, line.x, line.y);
      
      // Update progress
      currentProgress += lineLength;
    }
    
    // Add blinking cursor to the current line
    if (progress < totalChars) {
      let cursorLine = 0;
      let cursorPos = 0;
      let charsProcessed = 0;
      
      for (let i = 0; i < terminalLines.length; i++) {
        if (charsProcessed + terminalLines[i].text.length > progress) {
          cursorLine = i;
          cursorPos = progress - charsProcessed;
          break;
        }
        charsProcessed += terminalLines[i].text.length;
      }
      
      const line = terminalLines[cursorLine];
      const partialText = line.text.substring(0, cursorPos);
      const textWidth = ctx.measureText(partialText).width;
      
      // Check if cursor should be visible based on time
      if (Math.floor(Date.now() / 500) % 2 === 0) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(line.x + textWidth, line.y - 14, 9, 18);
      }
    }
  };

  // Draw image mode
  const drawImageMode = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, image: HTMLImageElement | null) => {
    if (image) {
      // Calculate aspect ratio to fill the entire canvas
      const canvasAspect = canvas.width / canvas.height;
      const imageAspect = image.width / image.height;
      
      let drawWidth, drawHeight, offsetX, offsetY;
      
      if (imageAspect > canvasAspect) {
        // Image is wider than canvas
        drawHeight = canvas.height;
        drawWidth = drawHeight * imageAspect;
        offsetX = (canvas.width - drawWidth) / 2;
        offsetY = 0;
      } else {
        // Image is taller than canvas
        drawWidth = canvas.width;
        drawHeight = drawWidth / imageAspect;
        offsetX = 0;
        offsetY = (canvas.height - drawHeight) / 2;
      }
      
      // Draw the image to fill the canvas
      ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
    } else {
      // Draw placeholder
      const imgAreaWidth = canvas.width;
      const imgAreaHeight = canvas.height;
      
      // Background for image area
      ctx.fillStyle = '#111111';
      ctx.fillRect(0, 0, imgAreaWidth, imgAreaHeight);
      
      // Draw placeholder with grid pattern
      ctx.beginPath();
      ctx.strokeStyle = '#222222';
      for (let gridX = 0; gridX < imgAreaWidth; gridX += 20) {
        ctx.moveTo(gridX, 0);
        ctx.lineTo(gridX, imgAreaHeight);
      }
      for (let gridY = 0; gridY < imgAreaHeight; gridY += 20) {
        ctx.moveTo(0, gridY);
        ctx.lineTo(imgAreaWidth, gridY);
      }
      ctx.stroke();
      
      // Picture icon
      ctx.fillStyle = '#555555';
      const iconSize = 60;
      const iconX = (imgAreaWidth / 2) - (iconSize / 2);
      const iconY = (imgAreaHeight / 2) - (iconSize / 2) - 20;
      
      // Draw picture icon
      ctx.fillRect(iconX, iconY, iconSize, iconSize);
      ctx.fillStyle = '#333333';
      ctx.fillRect(iconX + 10, iconY + 10, iconSize - 20, iconSize - 20);
      ctx.fillStyle = '#555555';
      ctx.beginPath();
      ctx.arc(iconX + 25, iconY + 25, 8, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw drag and drop message
      ctx.fillStyle = '#888888';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Drag and drop image here', imgAreaWidth / 2, imgAreaHeight / 2 + 60);
      ctx.font = '12px monospace';
      ctx.fillText('or click to load sample image', imgAreaWidth / 2, imgAreaHeight / 2 + 80);
      ctx.textAlign = 'left';
    }
  };

  // Handle display mode change
  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setDisplayMode(e.target.value);
    setUploadedImage(null);
  };
  
  // Handle filter change
  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    applyFilterPreset(e.target.value);
  };
  
  // Handle image upload via button
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            const img = new Image();
            img.onload = () => {
              setUploadedImage(img);
            };
            img.src = event.target.result as string;
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };
  
  // Load sample image
  const loadSampleImage = () => {
    if (displayMode === 'image' && !uploadedImage) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        setUploadedImage(img);
      };
      img.src = stockImageUrl;
    }
  };
  
  // Handle file drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (displayMode === 'image' && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            const img = new Image();
            img.onload = () => {
              setUploadedImage(img);
            };
            img.src = event.target.result as string;
          }
        };
        reader.readAsDataURL(file);
      }
    }
  };
  
  // Handle drag events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  return (
    <div className="flex gap-2">
      {/* Terminal container - 16:9 aspect ratio */}
      <div className="flex-1 max-w-4xl">
        <div 
          ref={containerRef} 
          className={`w-full bg-black rounded-md relative ${isDragging ? 'border-2 border-green-500' : ''}`}
          style={{ 
            aspectRatio: '16/9',
            boxShadow: '0 0 10px rgba(0, 255, 0, 0.3)' 
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => displayMode === 'image' && !uploadedImage && loadSampleImage()}
        />
        
        {/* Drag overlay */}
        {isDragging && displayMode === 'image' && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-20 pointer-events-none">
            <div className="text-green-400 font-mono text-xl">Drop Image Here</div>
          </div>
        )}
      </div>
      
      {/* Simplified Controls panel */}
      <div className="w-40 bg-gray-900 rounded border border-gray-800 p-2 space-y-1 text-xs">
                        {/* Mode selector */}
                <div>
                  <label className="block text-green-400 font-mono text-xs mb-1">Mode</label>
                  <select 
                    value={displayMode} 
                    onChange={handleModeChange}
                    title="Select display mode"
                    className="w-full bg-gray-800 text-green-400 border border-gray-700 rounded px-1 py-1 text-xs font-mono focus:outline-none"
                  >
                    <option value="text">Text</option>
                    <option value="image">Image</option>
                  </select>
                </div>
                
                {/* Filter selector */}
                <div>
                  <label className="block text-green-400 font-mono text-xs mb-1">Filter</label>
                  <select 
                    value={effectParams.selectedFilter} 
                    onChange={handleFilterChange}
                    title="Select filter preset"
                    className="w-full bg-gray-800 text-green-400 border border-gray-700 rounded px-1 py-1 text-xs font-mono focus:outline-none"
                  >
                    <option value="crt">CRT</option>
                    <option value="vhs">VHS</option>
                    <option value="glitch">Glitch</option>
                  </select>
                </div>
        
        {/* Upload button for image mode */}
        {displayMode === 'image' && (
          <div>
            <label className="block w-full bg-gray-800 text-green-400 border border-gray-700 rounded px-1 py-1 text-xs font-mono cursor-pointer hover:bg-gray-700 text-center">
              Upload
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleImageUpload}
              />
            </label>
          </div>
        )}
        
        {/* Divider */}
        <div className="border-t border-gray-700 pt-1">
          <div className="text-green-400 font-mono text-xs mb-1">Controls</div>
        </div>
        
        {/* Filter controls */}
        <div className="space-y-1">
                            <div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-mono text-xs">Dist</span>
                      <span className="text-green-400 font-mono text-xs">{effectParams.distortion.toFixed(2)}</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="0.3" 
                      step="0.001" 
                      value={effectParams.distortion} 
                      onChange={(e) => setEffectParams({...effectParams, distortion: parseFloat(e.target.value)})}
                      title="Adjust distortion amount"
                      className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-mono text-xs">Scan</span>
                      <span className="text-green-400 font-mono text-xs">{effectParams.scanlineIntensity.toFixed(2)}</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="1" 
                      step="0.01" 
                      value={effectParams.scanlineIntensity} 
                      onChange={(e) => setEffectParams({...effectParams, scanlineIntensity: parseFloat(e.target.value)})}
                      title="Adjust scanline intensity"
                      className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-mono text-xs">RGB</span>
                      <span className="text-green-400 font-mono text-xs">{effectParams.rgbShift.toFixed(3)}</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="0.02" 
                      step="0.001" 
                      value={effectParams.rgbShift} 
                      onChange={(e) => setEffectParams({...effectParams, rgbShift: parseFloat(e.target.value)})}
                      title="Adjust RGB color shift"
                      className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-mono text-xs">Noise</span>
                      <span className="text-green-400 font-mono text-xs">{effectParams.noise.toFixed(2)}</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="0.1" 
                      step="0.001" 
                      value={effectParams.noise} 
                      onChange={(e) => setEffectParams({...effectParams, noise: parseFloat(e.target.value)})}
                      title="Adjust noise amount"
                      className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400 font-mono text-xs">Flicker</span>
                      <span className="text-green-400 font-mono text-xs">{effectParams.flickerIntensity.toFixed(2)}</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="0.1" 
                      step="0.001" 
                      value={effectParams.flickerIntensity} 
                      onChange={(e) => setEffectParams({...effectParams, flickerIntensity: parseFloat(e.target.value)})}
                      title="Adjust flicker intensity"
                      className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
        </div>
      </div>
    </div>
  );
};

export default TerminalCRT;