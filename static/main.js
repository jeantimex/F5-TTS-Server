document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('tts-form');
    const textInput = document.getElementById('text-input');
    const speedInput = document.getElementById('speed-input');
    const speedValue = document.getElementById('speed-value');
    const nfeInput = document.getElementById('nfe-input');
    const nfeValue = document.getElementById('nfe-value');
    const crossfadeInput = document.getElementById('crossfade-input');
    const crossfadeValue = document.getElementById('crossfade-value');
    const refAudioSelect = document.getElementById('ref-audio-select');
    const refTextInput = document.getElementById('ref-text-input');
    const refAudioPlayerSection = document.getElementById('ref-audio-player-section');
    const refAudioPlayer = document.getElementById('ref-audio-player');
    const refAudioStatus = document.getElementById('ref-audio-status');
    const generateBtn = document.getElementById('generate-btn');
    const btnText = document.querySelector('.btn-text');
    const spinner = document.querySelector('.spinner');
    const resultSection = document.getElementById('result-section');
    const errorSection = document.getElementById('error-section');
    const audioPlayer = document.getElementById('audio-player');
    const audioStatus = document.getElementById('audio-status');
    const errorMessage = document.getElementById('error-message');

    let selectedRefAudio = 'basic_ref_en.wav'; // Default selection
    let refTexts = {}; // Store reference texts for each audio file

    // Load reference audio files on page load
    loadReferenceAudios();

    async function loadReferenceAudios() {
        try {
            refAudioSelect.disabled = true;
            const response = await fetch('/ref-audios/');
            const data = await response.json();
            
            // Clear existing options
            refAudioSelect.innerHTML = '';
            
            if (data.files && data.files.length > 0) {
                selectedRefAudio = data.default || data.files[0];
                refTexts = data.ref_texts || {};
                
                // Add options to select
                data.files.forEach(filename => {
                    const option = document.createElement('option');
                    option.value = filename;
                    option.textContent = filename;
                    option.selected = filename === data.default;
                    refAudioSelect.appendChild(option);
                });
                
                // Set initial reference text and audio player
                updateReferenceText(selectedRefAudio);
                updateReferenceAudioPlayer(selectedRefAudio);
                
                refAudioSelect.disabled = false;
            } else {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'No reference audio files found';
                option.disabled = true;
                refAudioSelect.appendChild(option);
            }
        } catch (error) {
            console.error('Error loading reference audios:', error);
            refAudioSelect.innerHTML = '<option value="" disabled>Error loading reference audios</option>';
        }
    }

    // Handle reference audio selection change
    refAudioSelect.addEventListener('change', function() {
        selectedRefAudio = this.value;
        updateReferenceText(selectedRefAudio);
        updateReferenceAudioPlayer(selectedRefAudio);
    });

    // Update reference text textarea based on selected audio
    function updateReferenceText(audioFilename) {
        if (refTexts[audioFilename]) {
            refTextInput.value = refTexts[audioFilename];
        } else {
            refTextInput.value = '';
        }
    }

    // Update reference audio player based on selected audio
    function updateReferenceAudioPlayer(audioFilename) {
        if (audioFilename && audioFilename !== '') {
            // Clean up previous audio URL if it exists
            if (refAudioPlayer.src && refAudioPlayer.src.startsWith('blob:')) {
                URL.revokeObjectURL(refAudioPlayer.src);
            }
            
            refAudioPlayer.src = `/ref-audios/${encodeURIComponent(audioFilename)}`;
            refAudioPlayer.load();
            refAudioPlayerSection.style.display = 'block';
            refAudioStatus.textContent = `Reference Audio: ${audioFilename}`;
        } else {
            refAudioPlayerSection.style.display = 'none';
            refAudioPlayer.src = '';
            refAudioStatus.textContent = '';
        }
    }

    // Update speed value display when slider changes
    speedInput.addEventListener('input', function() {
        speedValue.textContent = parseFloat(this.value).toFixed(1);
    });

    // Update NFE value display when slider changes
    nfeInput.addEventListener('input', function() {
        nfeValue.textContent = this.value;
    });

    // Update crossfade value display when slider changes
    crossfadeInput.addEventListener('input', function() {
        crossfadeValue.textContent = parseFloat(this.value).toFixed(2);
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
        const nfeSteps = parseInt(nfeInput.value);
        const crossfadeDuration = parseFloat(crossfadeInput.value);
        const refText = refTextInput.value.trim();
        
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
                    speed: speed,
                    nfe_steps: nfeSteps,
                    crossfade_duration: crossfadeDuration,
                    ref_audio: selectedRefAudio,
                    ref_text: refText
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

            // Get generation time from response headers
            const generationTime = parseFloat(response.headers.get('X-Generation-Time')) || 0;

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
            audioStatus.textContent = `Audio generated successfully! (${formatFileSize(audioBlob.size)}) - Generated in ${formatTime(generationTime)}`;

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

    function formatTime(seconds) {
        if (seconds < 1) {
            return `${Math.round(seconds * 1000)}ms`;
        } else if (seconds < 60) {
            return `${seconds.toFixed(1)}s`;
        } else {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = (seconds % 60).toFixed(1);
            return `${minutes}m ${remainingSeconds}s`;
        }
    }

    // Add some example text for demonstration
    textInput.placeholder = "Enter the text you want to convert to speech...\n\nExample: Hello! This is a demonstration of F5-TTS text-to-speech synthesis. The model can generate natural-sounding speech from any text input.";
});