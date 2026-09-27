if ('serviceWorker' in navigator) {
   window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js');
   });
}

const messageInput = document.getElementById("message");

const playButton = document.getElementById("play");
const stopButton = document.getElementById("stop");

const status = document.getElementById("status");

const textDisplay = document.getElementById("text-display");
const morseDisplay = document.getElementById("morse-display");

const waveform = document.getElementById("waveform");
const playhead = document.getElementById("playhead");

const lamp = document.getElementById("lamp");
const lightBeam = document.getElementById("light-beam");


let audioContext = null;
let oscillators = [];
let animationFrame = null;
let playing = false;
let timeline = null;
let playbackStart = 0;

/*
 * ---------------------------------------------------------
 * Waveform display
 * ---------------------------------------------------------
 */

const WAVE_LEFT = 35;
const WAVE_RIGHT = 725;
const WAVE_PLAYHEAD = 575;
const WAVE_BASE = 237.5;
const WAVE_HIGH = 218;
const WAVE_HISTORY = 3000;

/*
 * ---------------------------------------------------------
 * Character display
 * ---------------------------------------------------------
 */

let characters = [];

/*
 * Create the scrolling text and Morse displays.
 */

function createDisplays(text) {
    const upperText = text.toUpperCase().trim();

    textDisplay.innerHTML = "";
    textDisplay.className = "tracking-content";

    characters = [];
    let characterIndex = 0;
    for (const word of upperText.split(/\s+/)) {
        for (const character of word) {
            if (!MorseCode.map[character]) {
                continue;
            }

            const span = document.createElement("span");
            span.className = "tracked-character";
            span.textContent = character;
            span.dataset.index = characterIndex;
            textDisplay.appendChild(span);

            characters.push({ text: span, morse: null, index: characterIndex });

            characterIndex++;
        }

        /*
         * Preserve spaces between words.
         */

        if (word !== upperText.split(/\s+/).at(-1)) {
            const space = document.createElement("span");
            space.className = "tracked-character";
            space.textContent = " ";

            textDisplay.appendChild(space);
        }
    }

    /*
     * Morse display.
     *
     * Each character gets its own
     * little highlighted block.
     */

    morseDisplay.innerHTML = "";
    morseDisplay.className = "tracking-content";

    let morseIndex = 0;

    const words = upperText.split(/\s+/);

    for (let wordIndex = 0; wordIndex < words.length; wordIndex++) {
        const word = words[wordIndex];
        for (const character of word) {
            const code = MorseCode.map[character];
            if (!code) {
                continue;
            }

            const span = document.createElement("span");
            span.className = "morse-character";
            span.textContent = code;
            span.dataset.index = morseIndex;

            morseDisplay.appendChild(span);
            characters[morseIndex].morse = span;
            morseIndex++;
        }

        /*
         * Word separator.
         */

        if (wordIndex < words.length - 1) {
            const separator = document.createElement("span");
            separator.className = "morse-character";
            separator.textContent = " / ";
            morseDisplay.appendChild(separator);
        }
    }
}

/*
 * ---------------------------------------------------------
 * Audio
 * ---------------------------------------------------------
 */

function getAudioContext() {
    if (!audioContext) {
        audioContext = new AudioContext();
    }

    return audioContext;
}

/*
 * ---------------------------------------------------------
 * Prepare the message.
 * ---------------------------------------------------------
 */

function prepareMessage() {
    const text = messageInput.value.trim();
    if (!text) {
        textDisplay.textContent = "Enter some text";
        morseDisplay.textContent = "";

        return null;
    }

    timeline = MorseCode.timeline(text);
    createDisplays(text);

    return timeline;
}

/*
 * ---------------------------------------------------------
 * Find the Morse item at a particular time.
 * ---------------------------------------------------------
 */

function itemAt(time) {
    return timeline.items.find(item => time >= item.start && time < item.end);
}

/*
 * ---------------------------------------------------------
 * Update character tracking.
 * ---------------------------------------------------------
 */

function updateCharacterTracking(item) {
    /*
     * During a word gap or final gap there is
     * no current character.
     *
     * Leave the previous character highlighted.
     */

    if (!item || item.characterIndex === null) {
        return;
    }

    const index = item.characterIndex;

    /*
     * Remove the old highlight.
     */

    for (const character of characters) { 
       character.text.classList.remove("active");

        if (character.morse) {
            character.morse.classList.remove("active");
        }
    }

    /*
     * Highlight the current character.
     */

    const character = characters[index];
    if (!character) {
        return;
    }

    character.text.classList.add("active");
    if (character.morse) {
        character.morse.classList.add("active");
    }


    /*
     * Scroll the text display so that
     * the current character is near the
     * centre of its window.
     */

    const textWindow = textDisplay.parentElement;
    const textCentre = textWindow.clientWidth / 2;
    const textPosition = character.text.offsetLeft + character.text.offsetWidth / 2;
    const textOffset = textCentre - textPosition;

    textDisplay.style.transform = `translateX(${textOffset}px)`;

    /*
     * Do the same for the Morse display.
     */

    const morseWindow = morseDisplay.parentElement;
    const morseCentre = morseWindow.clientWidth / 2;
    const morsePosition = character.morse.offsetLeft + character.morse.offsetWidth / 2;
    const morseOffset = morseCentre - morsePosition;
    morseDisplay.style.transform = `translateX(${morseOffset}px)`;
}

/*
 * ---------------------------------------------------------
 * Schedule audio.
 * ---------------------------------------------------------
 */

function scheduleAudio(data) {
    const context = getAudioContext();

    const startTime = context.currentTime + 0.05;
    for (const item of data.items) {
        if (!item.tone) {
            continue;
        }

        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = 700;

        const start = startTime + item.start / 1000;
        const end = startTime + item.end / 1000;

        /*
         * Tiny fade-in/fade-out to prevent clicks.
         */

        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.22, start + 0.005);
        gain.gain.setValueAtTime(0.22, end - 0.005);
        gain.gain.linearRampToValueAtTime(0, end);

        oscillator.connect(gain);
        gain.connect(context.destination);

        oscillator.start(start);
        oscillator.stop(end);
        oscillators.push(oscillator);
    }

    playbackStart = startTime;
}

/*
 * ---------------------------------------------------------
 * Update flashlight, tracking and waveform.
 * ---------------------------------------------------------
 */

function updateVisuals(elapsed) {
    if (!timeline) {
        return;
    }

    const item = itemAt(elapsed);

    /*
     * Character / Morse tracking.
     */

    updateCharacterTracking(item);

    /*
     * Flashlight.
     */

    const transmitting = item?.tone === true;
    if (transmitting) {
        lamp.setAttribute("fill", "#fff8b0");
        lightBeam.setAttribute("opacity", "0.28");
    } 
    else {
        lamp.setAttribute("fill", "#5f6672");
        lightBeam.setAttribute("opacity", "0.025");
    }

    /*
     * Fixed waveform playhead.
     */

    playhead.setAttribute("opacity", "1");

    /*
     * -----------------------------------------------------
     * Scrolling waveform.
     * -----------------------------------------------------
     */

    const historyStart = Math.max(0, elapsed - WAVE_HISTORY);
    const points = [];

    for (let x = WAVE_LEFT; x <= WAVE_RIGHT; x += 4) {
        const proportion = (x - WAVE_LEFT) / (WAVE_RIGHT - WAVE_LEFT);
        const time = historyStart + proportion * WAVE_HISTORY;
        const signalItem = itemAt(time);
        const on = signalItem?.tone === true;
        const y = on ? WAVE_HIGH : WAVE_BASE;

        points.push(`${x} ${y}`);
    }

    waveform.setAttribute("points", points.join(", "));

    /*
     * End of message.
     */

    if (elapsed >= timeline.duration) {
        stopPlayback(false);
        return;
    }

    /*
     * Continue animation.
     *
     * AudioContext time remains the master clock.
     */

    animationFrame = requestAnimationFrame(() => { 
        const context = getAudioContext(); 
        const elapsedNow = (context.currentTime - playbackStart) * 1000;
        updateVisuals(elapsedNow);
    });
}

/*
 * ---------------------------------------------------------
 * Play
 * ---------------------------------------------------------
 */

async function play() {
    if (playing) {
        return;
    }

    const data = prepareMessage();
    if (!data) {
        return;
    }

    const context = getAudioContext();
    await context.resume();

    playing = true;
    playButton.disabled = true;
    stopButton.disabled = false;

    messageInput.disabled = true;
    status.textContent = "Transmitting…";
    scheduleAudio(data);
    updateVisuals(0);
}

/*
 * ---------------------------------------------------------
 * Stop
 * ---------------------------------------------------------
 */

function stopPlayback(updateStatus = true) {
    if ( !playing && oscillators.length === 0) {
        return;
    }

    playing = false;
    cancelAnimationFrame(animationFrame);
    animationFrame = null;

    for (const oscillator of oscillators) {
        try {
            oscillator.stop();
        } 
        catch {
            /*
             * Already stopped naturally.
             */
        }
    }

    oscillators = [];
    playButton.disabled = false;
    stopButton.disabled = true;
    messageInput.disabled = false;

    lamp.setAttribute("fill", "#fff4a3");
    lightBeam.setAttribute("opacity", "0.05");
    playhead.setAttribute("opacity", "0");

    if (updateStatus) {
        status.textContent = "Ready";
    }
}

/*
 * ---------------------------------------------------------
 * User interface
 * ---------------------------------------------------------
 */

playButton.addEventListener("click", play);
stopButton.addEventListener("click", () => stopPlayback(true));
messageInput.addEventListener("input", () => {
        if (!playing) {
            prepareMessage();
        }
    }
);

/*
 * ---------------------------------------------------------
 * Initial display
 * ---------------------------------------------------------
 */

prepareMessage();
