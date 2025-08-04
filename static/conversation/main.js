document.addEventListener('DOMContentLoaded', function() {
    const micButton = document.getElementById('mic-button');
    const canvas = document.getElementById('animation-canvas');
    const ctx = canvas.getContext('2d');
    
    let isRecording = false;
    let isProcessing = false;
    let animationId = null;
    
    // Canvas setup
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const baseRadius = 80;
    
    // Animation state
    let time = 0;
    let particles = [];
    
    // Initialize particles for idle animation
    function initParticles() {
        particles = [];
        for (let i = 0; i < 20; i++) {
            particles.push({
                angle: (i / 20) * Math.PI * 2,
                radius: baseRadius + Math.random() * 40,
                speed: 0.01 + Math.random() * 0.02,
                size: 2 + Math.random() * 3,
                opacity: 0.3 + Math.random() * 0.7
            });
        }
    }
    
    // Idle animation - subtle floating particles
    function drawIdleAnimation() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw main circle
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius);
        gradient.addColorStop(0, 'rgba(102, 126, 234, 0.3)');
        gradient.addColorStop(1, 'rgba(118, 75, 162, 0.1)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw floating particles
        particles.forEach(particle => {
            particle.angle += particle.speed;
            const x = centerX + Math.cos(particle.angle) * particle.radius;
            const y = centerY + Math.sin(particle.angle) * particle.radius;
            
            ctx.globalAlpha = particle.opacity * (0.5 + 0.5 * Math.sin(time * 2 + particle.angle));
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(x, y, particle.size, 0, Math.PI * 2);
            ctx.fill();
        });
        
        ctx.globalAlpha = 1;
        time += 0.02;
    }
    
    // Thinking animation - pulsing waves
    function drawThinkingAnimation() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw multiple pulsing circles
        for (let i = 0; i < 3; i++) {
            const radius = baseRadius + (Math.sin(time * 3 + i) * 20);
            const opacity = 0.3 - (i * 0.1);
            
            const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
            gradient.addColorStop(0, `rgba(255, 165, 2, ${opacity})`);
            gradient.addColorStop(1, `rgba(255, 99, 72, 0)`);
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.fill();
        }
        
        time += 0.05;
    }
    
    // Recording animation - sound wave visualization
    function drawRecordingAnimation() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw main recording circle
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius);
        gradient.addColorStop(0, 'rgba(255, 71, 87, 0.4)');
        gradient.addColorStop(1, 'rgba(255, 55, 66, 0.1)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(centerX, centerY, baseRadius + Math.sin(time * 10) * 10, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw sound wave bars
        const bars = 32;
        for (let i = 0; i < bars; i++) {
            const angle = (i / bars) * Math.PI * 2;
            const barHeight = 20 + Math.sin(time * 8 + i * 0.5) * 15;
            const startRadius = baseRadius + 20;
            const endRadius = startRadius + barHeight;
            
            const startX = centerX + Math.cos(angle) * startRadius;
            const startY = centerY + Math.sin(angle) * startRadius;
            const endX = centerX + Math.cos(angle) * endRadius;
            const endY = centerY + Math.sin(angle) * endRadius;
            
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 + 0.4 * Math.sin(time * 6 + i)})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }
        
        time += 0.1;
    }
    
    // Animation loop
    function animate() {
        if (isRecording) {
            drawRecordingAnimation();
        } else if (isProcessing) {
            drawThinkingAnimation();
        } else {
            drawIdleAnimation();
        }
        
        animationId = requestAnimationFrame(animate);
    }
    
    // Microphone button handler
    micButton.addEventListener('click', function() {
        if (isRecording) {
            stopRecording();
        } else if (!isProcessing) {
            startRecording();
        }
    });
    
    function startRecording() {
        isRecording = true;
        isProcessing = false;
        micButton.classList.add('recording');
        micButton.querySelector('.material-symbols-outlined').textContent = 'mic_off';
        
        // TODO: Implement actual recording logic
        console.log('Started recording...');
        
        // Simulate stopping recording after 5 seconds for demo
        setTimeout(() => {
            if (isRecording) {
                stopRecording();
            }
        }, 5000);
    }
    
    function stopRecording() {
        isRecording = false;
        isProcessing = true;
        micButton.classList.remove('recording');
        micButton.classList.add('processing');
        micButton.querySelector('.material-symbols-outlined').textContent = 'hourglass_top';
        
        console.log('Processing...');
        
        // TODO: Implement actual processing logic
        // Simulate processing for 3 seconds
        setTimeout(() => {
            stopProcessing();
        }, 3000);
    }
    
    function stopProcessing() {
        isProcessing = false;
        micButton.classList.remove('processing');
        micButton.querySelector('.material-symbols-outlined').textContent = 'mic';
        
        console.log('Ready for next interaction');
    }
    
    // Initialize
    initParticles();
    animate();
    
    // Handle window resize
    window.addEventListener('resize', function() {
        // Canvas will maintain its size, but we could implement responsive scaling here if needed
    });
});