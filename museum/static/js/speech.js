// Simple wrapper around the browser speech engine used by the staff app.
const Speech = {
  synth: window.speechSynthesis,
  voices: [],

  init() {
    const load = () => {
      this.voices = this.synth ? this.synth.getVoices() : [];
      const select = document.getElementById("voice");
      if (select && this.voices.length) {
        select.innerHTML = this.voices
          .map((v) => `<option value="${v.name}">${v.name} (${v.lang})</option>`)
          .join("");
      }
    };
    load();
    if (this.synth && typeof this.synth.onvoiceschanged !== "undefined") {
      this.synth.onvoiceschanged = load;
    }
  },

  speak(text, options = {}) {
    if (!this.synth || !text) return;
    this.stop();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options.rate || 1;
    if (options.voiceName) {
      const voice = this.voices.find((v) => v.name === options.voiceName);
      if (voice) utterance.voice = voice;
    }
    this.synth.speak(utterance);
  },

  stop() {
    if (this.synth && (this.synth.speaking || this.synth.pending)) {
      this.synth.cancel();
    }
  },
};

document.addEventListener("DOMContentLoaded", () => Speech.init());
