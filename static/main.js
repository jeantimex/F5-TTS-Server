document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('tts-form');
    const textInput = document.getElementById('text-input');
    const speedInput = document.getElementById('speed-input');
    const speedValue = document.getElementById('speed-value');
    const generateBtn = document.getElementById('generate-btn');
    const btnText = document.querySelector('.btn-text');
    const spinner = document.querySelector('.spinner');
    const resultSection = document.getElementById('result-section');
    const errorSection = document.getElementById('error-section');
    const audioPlayer = document.getElementById('audio-player');
    const audioStatus = document.getElementById('audio-status');
    const errorMessage = document.getElementById('error-message');

    // Update speed value display when slider changes
    speedInput.addEventListener('input', function() {
        speedValue.textContent = parseFloat(this.value).toFixed(1);
    });

    // Make advanced settings collapsible
    const advancedSettings = document.querySelector('.advanced-settings');
    const legend = advancedSettings.querySelector('legend');
    
    legend.addEventListener('click', function() {
        advancedSettings.classList.toggle('collapsed');
    });

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const text = textInput.value.trim();
        const speed = parseFloat(speedInput.value);
        
        if (!text) {
            showError('Please enter some text to convert to speech.');
            return;
        }

        // Show loading state
        setLoadingState(true);
        hideResults();
        hideError();

        try {
            const response = await fetch('/tts/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    gen_text: text,
                    speed: speed
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
            }

            // Get the audio blob from the streaming response
            const audioBlob = await response.blob();
            
            if (audioBlob.size === 0) {
                throw new Error('Received empty audio file');
            }

            // Clean up previous audio URL if it exists
            if (audioPlayer.src && audioPlayer.src.startsWith('blob:')) {
                URL.revokeObjectURL(audioPlayer.src);
            }
            
            // Create object URL for the audio blob
            const audioUrl = URL.createObjectURL(audioBlob);
            
            // Set up the audio player
            audioPlayer.src = audioUrl;
            audioPlayer.load();
            
            // Show results
            showResults();
            audioStatus.textContent = `Audio generated successfully! (${formatFileSize(audioBlob.size)})`;

        } catch (error) {
            console.error('Error generating speech:', error);
            showError(error.message || 'An unexpected error occurred while generating speech.');
        } finally {
            setLoadingState(false);
        }
    });

    function setLoadingState(loading) {
        generateBtn.disabled = loading;
        if (loading) {
            btnText.style.display = 'none';
            spinner.style.display = 'inline';
        } else {
            btnText.style.display = 'inline';
            spinner.style.display = 'none';
        }
    }

    function showResults() {
        resultSection.style.display = 'block';
    }

    function hideResults() {
        resultSection.style.display = 'none';
        
        // Clean up blob URL before clearing src
        if (audioPlayer.src && audioPlayer.src.startsWith('blob:')) {
            URL.revokeObjectURL(audioPlayer.src);
        }
        
        audioPlayer.src = '';
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorSection.style.display = 'block';
    }

    function hideError() {
        errorSection.style.display = 'none';
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Add some example text for demonstration
    textInput.placeholder = "Enter the text you want to convert to speech...\n\nExample: Hello! This is a demonstration of F5-TTS text-to-speech synthesis. The model can generate natural-sounding speech from any text input.";
});