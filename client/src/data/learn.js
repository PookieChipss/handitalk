// src/data/learn.js
export const categories = [
  { id: "alphabet", title: "Alphabet", emoji: "🔤" },
  { id: "numbers",  title: "Numbers",  emoji: "🔢" },
  { id: "phrases",  title: "Daily Phrases", emoji: "🤟" },
  { id: "emotions", title: "Emotions", emoji: "😊" },
  { id: "greetings", title: "Greetings", emoji: "👋" },
  { id: "objects",  title: "Objects", emoji: "🧩" },
];

// A simple content map. Start with two categories; you can expand.
export const content = {
  alphabet: {
    title: "Alphabet",
    tiles: "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((ch) => ({
      id: ch,
      label: ch,
      // Put your own assets in /public/assets/... and /public/audio/...
      image: `/assets/alphabet/${ch}.png`,       // or .gif
      audio: `/audio/alphabet/${ch}.mp3`,
      tts: `Letter ${ch}`,                       // fallback phrase if audio missing
    })),
  },

  numbers: {
    title: "Numbers",
    tiles: Array.from({ length: 10 }, (_, i) => {
      const n = i + 1;
      return {
        id: String(n),
        label: String(n),
        image: `/assets/numbers/${n}.png`,       // or .gif
        audio: `/audio/numbers/${n}.mp3`,
        tts: `Number ${n}`,
      };
    }),
  },

  // Add phrases/emotions/greetings/objects later using the same shape
};
