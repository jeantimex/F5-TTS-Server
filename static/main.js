document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('tts-form');
    const textInput = document.getElementById('text-input');
    const speedInput = document.getElementById('speed-input');
    const speedValue = document.getElementById('speed-value');
    const nfeInput = document.getElementById('nfe-input');
    const nfeValue = document.getElementById('nfe-value');
    const crossfadeInput = document.getElementById('crossfade-input');
    const crossfadeValue = document.getElementById('crossfade-value');
    const removeSilenceInput = document.getElementById('remove-silence-input');
    const randomizeSeedInput = document.getElementById('randomize-seed-input');
    const seedInput = document.getElementById('seed-input');
    const refAudioSelect = document.getElementById('ref-audio-select');
    const refTextInput = document.getElementById('ref-text-input');
    const refAudioPlayerSection = document.getElementById('ref-audio-player-section');
    const refAudioPlayer = document.getElementById('ref-audio-player');
    const uploadBtn = document.getElementById('upload-btn');
    const refAudioUpload = document.getElementById('ref-audio-upload');
    const deleteBtn = document.getElementById('delete-btn');
    const textUploadBtn = document.getElementById('text-upload-btn');
    const textFileUpload = document.getElementById('text-file-upload');
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
    let currentTTSController = null; // Track current TTS request for cancellation
    let currentRequestId = null; // Track current request ID for backend cancellation
    
    // Wavesurfer instances
    let refWavesurfer = null;
    let genWavesurfer = null;

    // Initialize wavesurfer instances
    initializeWavesurfers();
    
    // Load reference audio files on page load
    loadReferenceAudios();

    // Handle upload button click
    uploadBtn.addEventListener('click', function() {
        refAudioUpload.click();
    });

    // Handle file selection for upload
    refAudioUpload.addEventListener('change', function(e) {
        const files = e.target.files;
        if (files.length > 0) {
            uploadReferenceAudios(files);
        }
    });

    // Handle text upload button click
    textUploadBtn.addEventListener('click', function() {
        textFileUpload.click();
    });

    // Handle text file selection for upload
    textFileUpload.addEventListener('change', function(e) {
        const files = e.target.files;
        if (files.length > 0) {
            uploadTextFiles(files);
        }
    });

    // Handle delete button click
    deleteBtn.addEventListener('click', function() {
        if (selectedRefAudio && selectedRefAudio.startsWith('custom/')) {
            deleteReferenceAudio(selectedRefAudio);
        }
    });

    // Initialize seed input state based on checkbox
    seedInput.disabled = randomizeSeedInput.checked;

    // Handle randomize seed checkbox change
    randomizeSeedInput.addEventListener('change', function() {
        seedInput.disabled = this.checked;
        if (this.checked) {
            // When randomizing, show placeholder to indicate it will be auto-generated
            seedInput.style.opacity = '0.6';
        } else {
            // When using custom seed, make it fully visible and focusable
            seedInput.style.opacity = '1';
            seedInput.focus();
        }
    });

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
                    // Display cleaner names: show folder prefix for organization
                    if (filename.startsWith('default/')) {
                        option.textContent = `📁 ${filename.replace('default/', '')} (default)`;
                    } else if (filename.startsWith('custom/')) {
                        option.textContent = `🎵 ${filename.replace('custom/', '')} (custom)`;
                    } else {
                        option.textContent = filename;
                    }
                    option.selected = filename === data.default;
                    refAudioSelect.appendChild(option);
                });
                
                // Set initial reference text and audio player
                updateReferenceText(selectedRefAudio);
                updateReferenceAudioPlayer(selectedRefAudio);
                updateDeleteButtonState(selectedRefAudio);
                
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
        updateDeleteButtonState(selectedRefAudio);
    });

    // Update reference text textarea based on selected audio
    function updateReferenceText(audioFilename) {
        if (refTexts[audioFilename]) {
            refTextInput.value = refTexts[audioFilename];
        } else {
            refTextInput.value = '';
        }
    }

    // Initialize wavesurfer instances
    function initializeWavesurfers() {
        // Reference audio wavesurfer - connect to existing audio element
        refWavesurfer = WaveSurfer.create({
            container: '#ref-waveform',
            media: refAudioPlayer, // Pass the HTML5 audio element
            waveColor: '#ff4e00',
            progressColor: '#dd5e98',
            cursorColor: '#ddd5e9',
            height: 60,
            responsive: true,
            normalize: true,
            cursorWidth: 2,
            dragToSeek: true,
            barGap: 2,
        });
        
        // Generated audio wavesurfer - connect to existing audio element
        genWavesurfer = WaveSurfer.create({
            container: '#generated-waveform',
            media: audioPlayer, // Pass the HTML5 audio element
            waveColor: '#ff4e00',
            progressColor: '#dd5e98',
            cursorColor: '#ddd5e9',
            height: 80,
            responsive: true,
            normalize: true,
            cursorWidth: 2,
            dragToSeek: true,
            barGap: 2,
        });
    }
    
    // Update reference audio player based on selected audio
    function updateReferenceAudioPlayer(audioFilename) {
        if (audioFilename && audioFilename !== '') {
            const audioUrl = `/ref-audios/${encodeURIComponent(audioFilename)}`;
            
            // Clean up previous audio URL if it exists
            if (refAudioPlayer.src && refAudioPlayer.src.startsWith('blob:')) {
                URL.revokeObjectURL(refAudioPlayer.src);
            }
            
            // Set audio source - wavesurfer will automatically sync
            refAudioPlayer.src = audioUrl;
            refAudioPlayer.load();
            
            // Load waveform - since media is connected, this will sync automatically
            refWavesurfer.load(audioUrl);
            
            refAudioPlayerSection.style.display = 'block';
        } else {
            refAudioPlayerSection.style.display = 'none';
            refAudioPlayer.src = '';
            refWavesurfer.empty();
        }
    }

    // Update delete button state based on selected audio
    function updateDeleteButtonState(audioFilename) {
        // Only enable delete button for custom audio files
        if (audioFilename && audioFilename.startsWith('custom/')) {
            deleteBtn.disabled = false;
            deleteBtn.style.opacity = '1';
        } else {
            deleteBtn.disabled = true;
            deleteBtn.style.opacity = '0.6';
        }
    }

    // Delete a reference audio file
    async function deleteReferenceAudio(audioFilename) {
        if (!audioFilename || !audioFilename.startsWith('custom/')) {
            showError('Only custom reference audio files can be deleted.');
            return;
        }

        // Show confirmation dialog
        const fileName = audioFilename.replace('custom/', '');
        if (!confirm(`Are you sure you want to delete "${fileName}"? This action cannot be undone.`)) {
            return;
        }

        // Show loading state
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = '<span class="delete-icon">⏳</span> Deleting...';

        try {
            const response = await fetch(`/delete-ref-audio/${encodeURIComponent(audioFilename)}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `Delete failed with status: ${response.status}`);
            }

            const result = await response.json();
            
            // Success - refresh the dropdown and select default
            await loadReferenceAudios();
            
            // Show success feedback
            deleteBtn.innerHTML = '<span class="delete-icon">✅</span> Deleted!';
            setTimeout(() => {
                deleteBtn.innerHTML = '<span class="delete-icon">🗑️</span> Delete';
            }, 2000);

        } catch (error) {
            console.error('Delete error:', error);
            showError(`Failed to delete file: ${error.message}`);
            
            // Reset button state
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = '<span class="delete-icon">🗑️</span> Delete';
        }
    }

    // Upload multiple reference audio files
    async function uploadReferenceAudios(files) {
        const allowedTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/flac', 'audio/x-m4a', 'audio/ogg'];
        const allowedExtensions = ['.wav', '.mp3', '.flac', '.m4a', '.ogg'];
        const maxSize = 50 * 1024 * 1024; // 50MB per file
        
        // Validate all files first
        const validFiles = [];
        const errors = [];
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
            
            // Check file type
            if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension)) {
                errors.push(`${file.name}: Invalid file type. Only WAV, MP3, FLAC, M4A, and OGG files are allowed.`);
                continue;
            }
            
            // Check file size
            if (file.size > maxSize) {
                errors.push(`${file.name}: File size must be less than 50MB.`);
                continue;
            }
            
            validFiles.push(file);
        }
        
        // Show errors if any
        if (errors.length > 0) {
            showError('Upload errors:\n' + errors.join('\n'));
            refAudioUpload.value = ''; // Clear the input
            return;
        }
        
        if (validFiles.length === 0) {
            showError('No valid files selected for upload.');
            refAudioUpload.value = '';
            return;
        }
        
        // Show upload progress
        uploadBtn.disabled = true;
        uploadBtn.innerHTML = '<span class="upload-icon">⏳</span> Uploading...';
        
        const uploadResults = [];
        const uploadErrors = [];
        
        // Upload files one by one
        for (let i = 0; i < validFiles.length; i++) {
            const file = validFiles[i];
            try {
                const formData = new FormData();
                formData.append('file', file);
                
                const response = await fetch('/upload-ref-audio/', {
                    method: 'POST',
                    body: formData
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.detail || `Upload failed with status: ${response.status}`);
                }
                
                const result = await response.json();
                uploadResults.push(result.filename);
                
            } catch (error) {
                console.error(`Upload error for ${file.name}:`, error);
                uploadErrors.push(`${file.name}: ${error.message}`);
            }
        }
        
        // Reset upload button
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<span class="upload-icon">📁</span> Upload Audio';
        refAudioUpload.value = ''; // Clear the input
        
        // Show results
        if (uploadResults.length > 0) {
            // Refresh the dropdown to include new files
            await refreshReferenceAudios(uploadResults[uploadResults.length - 1]); // Select the last uploaded file
            
            // Show success message
            const successMsg = uploadResults.length === 1 
                ? `Successfully uploaded: ${uploadResults[0]}` 
                : `Successfully uploaded ${uploadResults.length} files: ${uploadResults.join(', ')}`;
            
            // Temporarily show success in upload button
            uploadBtn.innerHTML = '<span class="upload-icon">✅</span> Success!';
            setTimeout(() => {
                uploadBtn.innerHTML = '<span class="upload-icon">📁</span> Upload Audio';
            }, 2000);
        }
        
        // Show any errors
        if (uploadErrors.length > 0) {
            showError('Some uploads failed:\n' + uploadErrors.join('\n'));
        }
    }

    // Upload multiple text files
    async function uploadTextFiles(files) {
        const maxSize = 10 * 1024 * 1024; // 10MB per file
        
        // Validate all files first
        const validFiles = [];
        const errors = [];
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            // Check file type
            if (!file.name.toLowerCase().endsWith('.txt')) {
                errors.push(`${file.name}: Invalid file type. Only TXT files are allowed.`);
                continue;
            }
            
            // Check file size
            if (file.size > maxSize) {
                errors.push(`${file.name}: File size must be less than 10MB.`);
                continue;
            }
            
            validFiles.push(file);
        }
        
        // Show errors if any
        if (errors.length > 0) {
            showError('Upload errors:\n' + errors.join('\n'));
            textFileUpload.value = ''; // Clear the input
            return;
        }
        
        if (validFiles.length === 0) {
            showError('No valid text files selected for upload.');
            textFileUpload.value = '';
            return;
        }
        
        // Show upload progress
        textUploadBtn.disabled = true;
        textUploadBtn.innerHTML = '<span class="upload-icon">⏳</span> Uploading...';
        
        const uploadResults = [];
        const uploadErrors = [];
        let lastUploadedContent = '';
        
        // Upload files one by one
        for (let i = 0; i < validFiles.length; i++) {
            const file = validFiles[i];
            try {
                const formData = new FormData();
                formData.append('file', file);
                
                const response = await fetch('/upload-text-file/', {
                    method: 'POST',
                    body: formData
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.detail || `Upload failed with status: ${response.status}`);
                }
                
                const result = await response.json();
                uploadResults.push(result.filename);
                lastUploadedContent = result.content; // Keep the content from the last uploaded file
                
            } catch (error) {
                console.error(`Upload error for ${file.name}:`, error);
                uploadErrors.push(`${file.name}: ${error.message}`);
            }
        }
        
        // Reset upload button
        textUploadBtn.disabled = false;
        textUploadBtn.innerHTML = '<span class="upload-icon">📄</span> Upload Text';
        textFileUpload.value = ''; // Clear the input
        
        // Show results and update textarea
        if (uploadResults.length > 0) {
            // Update the reference text textarea with the content from the last uploaded file
            refTextInput.value = lastUploadedContent;
            
            // Show success message
            const successMsg = uploadResults.length === 1 
                ? `Successfully uploaded: ${uploadResults[0]}` 
                : `Successfully uploaded ${uploadResults.length} files: ${uploadResults.join(', ')}`;
            
            // Temporarily show success in upload button
            textUploadBtn.innerHTML = '<span class="upload-icon">✅</span> Success!';
            setTimeout(() => {
                textUploadBtn.innerHTML = '<span class="upload-icon">📄</span> Upload Text';
            }, 2000);
        }
        
        // Show any errors
        if (uploadErrors.length > 0) {
            showError('Some text file uploads failed:\n' + uploadErrors.join('\n'));
        }
    }

    // Refresh reference audios and select a specific file
    async function refreshReferenceAudios(selectFilename = null) {
        try {
            const response = await fetch('/ref-audios/');
            const data = await response.json();
            
            if (data.files && data.files.length > 0) {
                refTexts = data.ref_texts || {};
                
                // Clear and repopulate dropdown
                refAudioSelect.innerHTML = '';
                data.files.forEach(filename => {
                    const option = document.createElement('option');
                    option.value = filename;
                    // Display cleaner names: show folder prefix for organization
                    if (filename.startsWith('default/')) {
                        option.textContent = `📁 ${filename.replace('default/', '')} (default)`;
                    } else if (filename.startsWith('custom/')) {
                        option.textContent = `🎵 ${filename.replace('custom/', '')} (custom)`;
                    } else {
                        option.textContent = filename;
                    }
                    option.selected = filename === selectFilename || (selectFilename === null && filename === data.default);
                    refAudioSelect.appendChild(option);
                });
                
                // Update selected audio
                selectedRefAudio = selectFilename || data.default || data.files[0];
                updateReferenceText(selectedRefAudio);
                updateReferenceAudioPlayer(selectedRefAudio);
                updateDeleteButtonState(selectedRefAudio);
            }
        } catch (error) {
            console.error('Error refreshing reference audios:', error);
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
        
        // If TTS is currently running, stop it
        if (currentTTSController) {
            stopTTSGeneration();
            return;
        }
        
        // Start new TTS generation
        startTTSGeneration();
    });

    async function startTTSGeneration() {
        const text = textInput.value.trim();
        const speed = parseFloat(speedInput.value);
        const nfeSteps = parseInt(nfeInput.value);
        const crossfadeDuration = parseFloat(crossfadeInput.value);
        const removeSilence = removeSilenceInput.checked;
        const randomizeSeed = randomizeSeedInput.checked;
        const seed = randomizeSeed ? null : (seedInput.value ? parseInt(seedInput.value) : null);
        const refText = refTextInput.value.trim();
        
        if (!text) {
            showError('Please enter some text to convert to speech.');
            return;
        }

        // Generate new request ID and create AbortController
        currentRequestId = generateUUID();
        currentTTSController = new AbortController();

        // Show loading state
        setLoadingState(true);
        hideResults();
        hideError();

        console.log(`Starting TTS generation with Request ID: ${currentRequestId}`);

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
                    remove_silence: removeSilence,
                    randomize_seed: randomizeSeed,
                    seed: seed,
                    ref_audio: selectedRefAudio,
                    ref_text: refText,
                    request_id: currentRequestId
                }),
                signal: currentTTSController.signal
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

            // Get generation time and seed from response headers
            const generationTime = parseFloat(response.headers.get('X-Generation-Time')) || 0;
            const usedSeed = response.headers.get('X-Used-Seed');

            // Clean up previous audio URL if it exists
            if (audioPlayer.src && audioPlayer.src.startsWith('blob:')) {
                URL.revokeObjectURL(audioPlayer.src);
            }
            
            // Create object URL for the audio blob
            const audioUrl = URL.createObjectURL(audioBlob);
            
            // Set up the audio player - wavesurfer will automatically sync
            audioPlayer.src = audioUrl;
            audioPlayer.load();
            
            // Load waveform with the blob - since media is connected, this will sync automatically
            genWavesurfer.loadBlob(audioBlob);
            
            // Update seed input field with the actual seed used
            if (usedSeed) {
                seedInput.value = usedSeed;
                // Add visual feedback that the seed was updated
                if (randomizeSeed) {
                    seedInput.style.backgroundColor = '#e8f4fd';
                    setTimeout(() => {
                        seedInput.style.backgroundColor = '';
                    }, 2000);
                }
            }

            // Show results
            showResults();
            audioStatus.textContent = `Audio generated successfully! (${formatFileSize(audioBlob.size)}) - Generated in ${formatTime(generationTime)} - Seed: ${usedSeed || 'unknown'}`;

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('TTS generation was cancelled by user');
                // Don't show error message for user-initiated cancellation
            } else {
                console.error('Error generating speech:', error);
                showError(error.message || 'An unexpected error occurred while generating speech.');
            }
        } finally {
            // Clear the controller, request ID, and reset button state
            currentTTSController = null;
            currentRequestId = null;
            setLoadingState(false);
        }
    }

    async function stopTTSGeneration() {
        if (currentTTSController && currentRequestId) {
            console.log(`Stopping TTS generation... Request ID: ${currentRequestId}`);
            
            // First, abort the frontend request
            currentTTSController.abort();
            
            // Then, try to cancel the backend process
            try {
                const response = await fetch(`/cancel-tts/${encodeURIComponent(currentRequestId)}`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    const result = await response.json();
                    if (result.status === 'already_completed') {
                        console.log('TTS process already completed:', result.message);
                    } else {
                        console.log('Backend TTS process cancelled:', result.message);
                    }
                } else {
                    console.warn('Failed to cancel backend TTS process:', response.status);
                }
            } catch (error) {
                console.warn('Error cancelling backend TTS process:', error);
            }
            
            // Clean up
            currentTTSController = null;
            currentRequestId = null;
            setLoadingState(false);
        }
    }

    function setLoadingState(loading) {
        if (loading) {
            // Change to stop button
            btnText.textContent = 'Stop Generation';
            btnText.style.display = 'inline';
            spinner.style.display = 'none';
            generateBtn.style.background = 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)';
            generateBtn.disabled = false; // Keep enabled so user can click to stop
        } else {
            // Change back to generate button
            btnText.textContent = 'Generate Speech';
            btnText.style.display = 'inline';
            spinner.style.display = 'none';
            generateBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            generateBtn.disabled = false;
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
        genWavesurfer.empty();
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorSection.style.display = 'block';
    }

    function hideError() {
        errorSection.style.display = 'none';
    }

    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
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