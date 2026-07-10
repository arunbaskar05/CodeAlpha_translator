// script.js
// Handles all client-side interactivity for the translator app.

document.addEventListener('DOMContentLoaded', function () {

    /* =========================================
       1. SELECT DOM ELEMENTS
       We grab references to every element we'll need,
       once, at the top — avoids repeated lookups later.
       ========================================= */
    const inputText = document.getElementById('inputText');
    const charCount = document.getElementById('charCount');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const body = document.body;

    /* =========================================
       2. CHARACTER COUNTER
       ========================================= */

    // The 'input' event fires every time the textarea's content changes
    // (typing, pasting, deleting) — more reliable than 'keyup' for this purpose,
    // since it also catches paste/cut actions.
    inputText.addEventListener('input', function () {
        const currentLength = inputText.value.length; // .value gets the current text; .length counts characters
        const maxLength = inputText.getAttribute('maxlength'); // read the HTML maxlength="500" we set earlier

        // Update the counter text, e.g. "42 / 500"
        charCount.textContent = `${currentLength} / ${maxLength}`;

        // Give visual feedback when nearing the limit (simple UX improvement)
        if (currentLength >= maxLength * 0.9) {
            charCount.style.color = 'var(--error-color)';
        } else {
            charCount.style.color = ''; // reset to default CSS-defined color
        }
    });

    /* =========================================
       3. DARK MODE TOGGLE
       ========================================= */

    // Check localStorage for a previously saved preference,
    // so the user's choice persists across page reloads.
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme === 'dark') {
        body.classList.add('dark-mode');
        darkModeToggle.textContent = '☀️'; // show sun icon, meaning "click to go light"
    }

    darkModeToggle.addEventListener('click', function () {
        // toggle() adds the class if it's missing, removes it if present,
        // and returns true/false depending on the resulting state.
        const isDarkMode = body.classList.toggle('dark-mode');

        // Update the icon and save the preference
        if (isDarkMode) {
            darkModeToggle.textContent = '☀️';
            localStorage.setItem('theme', 'dark');
        } else {
            darkModeToggle.textContent = '🌙';
            localStorage.setItem('theme', 'light');
        }
    });

});
/* =========================================
       4. TRANSLATION LOGIC
       ========================================= */

    // Select the remaining elements we need for this feature
    const sourceLang = document.getElementById('sourceLang');
    const targetLang = document.getElementById('targetLang');
    const outputText = document.getElementById('outputText');
    const translateBtn = document.getElementById('translateBtn');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const errorMessage = document.getElementById('errorMessage');

    // Small helper functions keep the main logic below readable.
    // Each one has a single, clear responsibility.

    function showLoading() {
        loadingSpinner.classList.remove('hidden');
        translateBtn.disabled = true; // prevents duplicate submissions while waiting
        errorMessage.classList.add('hidden'); // clear any old error when starting a new request
    }

    function hideLoading() {
        loadingSpinner.classList.add('hidden');
        translateBtn.disabled = false;
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove('hidden');
    }

    async function handleTranslate() {
        const text = inputText.value.trim(); // trim() removes leading/trailing whitespace

        // Client-side validation BEFORE calling the server —
        // saves an unnecessary network request for an obviously invalid input.
        if (!text) {
            showError('Please enter some text to translate.');
            return; // stops the function here, nothing further runs
        }

        showLoading();

        try {
            const response = await fetch('/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text,
                    source: sourceLang.value,
                    target: targetLang.value
                })
            });

            // Parse the JSON body regardless of success or failure —
            // our Flask route always returns JSON either way (Step 6 design).
            const data = await response.json();

            if (!response.ok) {
                // response.ok is true only for status codes 200–299.
                // For 400/500 responses, we throw here so the catch block below handles it,
                // keeping our error-handling logic in ONE place.
                throw new Error(data.error || 'Something went wrong. Please try again.');
            }

            outputText.value = data.translatedText;

        } catch (error) {
            // This catches BOTH network failures (fetch itself fails, e.g. no internet)
            // AND the error we manually threw above for 400/500 responses.
            showError(error.message);

        } finally {
            // finally{} runs whether we succeeded or failed — guarantees
            // the loading state is always cleaned up, no matter what happened.
            hideLoading();
        }
    }

    // Wire the button click to our function
    translateBtn.addEventListener('click', handleTranslate);
/* =========================================
       5. COPY TO CLIPBOARD
       ========================================= */
    const copyBtn = document.getElementById('copyBtn');

    copyBtn.addEventListener('click', async function () {
        // Guard clause: don't try to copy an empty result
        if (!outputText.value) {
            showError('Nothing to copy yet — translate some text first.');
            return;
        }

        try {
            await navigator.clipboard.writeText(outputText.value);

            // Brief visual feedback so the user knows the click registered.
            // We temporarily change the button text, then restore it.
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '✅ Copied!';

            // setTimeout schedules code to run after a delay (in milliseconds),
            // without blocking anything else on the page in the meantime.
            setTimeout(function () {
                copyBtn.textContent = originalText;
            }, 1500);

        } catch (error) {
            showError('Could not copy text. Please copy it manually.');
        }
    });

/* =========================================
       6. TEXT-TO-SPEECH (Server-Side via gTTS)
       ========================================= */
    const speakBtn = document.getElementById('speakBtn');

    async function handleSpeak() {
        if (!outputText.value) {
            showError('Nothing to speak yet — translate some text first.');
            return;
        }

        try {
            const response = await fetch('/speak', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: outputText.value,
                    lang: targetLang.value
                })
            });

            if (!response.ok) {
                // The server sent back JSON with an error (not audio) in this case.
                const errorData = await response.json();
                throw new Error(errorData.error || 'Could not generate speech.');
            }

            // response.blob() reads the response body as raw binary data
            // (a "Blob" — Binary Large Object), which is what audio/image/file
            // data is represented as in the browser, as opposed to text or JSON.
            const audioBlob = await response.blob();

            // Blobs can't be played directly — we need a URL the <audio> element
            // can point to. createObjectURL() generates a temporary local URL
            // (like "blob:http://localhost:5000/3fa8...") that references this
            // data in memory, without needing to upload/download it anywhere.
            const audioUrl = URL.createObjectURL(audioBlob);

            const audio = new Audio(audioUrl);
            audio.play();

            // Clean up the temporary URL once playback finishes, to free memory.
            // Without this, repeated clicks would slowly leak memory over time.
            audio.addEventListener('ended', function () {
                URL.revokeObjectURL(audioUrl);
            });

        } catch (error) {
            showError(error.message);
        }
    }

    speakBtn.addEventListener('click', handleSpeak);
/* =========================================
       7. LANGUAGE SWAP
       ========================================= */
    const swapBtn = document.getElementById('swapLang');

    swapBtn.addEventListener('click', function () {
        // Don't allow swapping when source is "Detect Language" —
        // there's no real language code to swap INTO the target dropdown.
        if (sourceLang.value === 'auto') {
            showError('Cannot swap when source is set to "Detect Language."');
            return;
        }

        // Temporarily store one value before overwriting it —
        // classic "swap two variables" pattern, using a temp variable
        // so neither value gets lost mid-swap.
        const tempLang = sourceLang.value;
        sourceLang.value = targetLang.value;
        targetLang.value = tempLang;

        // Bonus UX: also swap the text content, so users can quickly
        // "reverse translate" without retyping anything.
        const tempText = inputText.value;
        inputText.value = outputText.value;
        outputText.value = tempText;

        // Since we just changed inputText programmatically (not by user typing),
        // the character counter won't auto-update — we trigger it manually here.
        // 'input' event dispatch simulates the same event that typing would fire.
        inputText.dispatchEvent(new Event('input'));
    });