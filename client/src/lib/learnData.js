// src/lib/learnData.js
// Single source of truth for items in each learning category.

export const LearnData = {
  alphabet: Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),

  // Numbers 0..30
  numbers: Array.from({ length: 31 }, (_, i) => String(i)),

  // Daily phrases / core words (hello & thank you moved to greetings)
  phrases: [
    "All done","Don't","Eat","Friends","Help","Hungry","Like","Me","More","No",
    "Play","Please","Stop","Toilet","Want","Water",
    "What","When","Where","Who","Why","Yes","You",
  ],

  // Greetings (based on your /assets/greetings/*.webp)
  greetings: ["Hello","Goodbye","Please","Sorry","Thank you","Yes","No","I love you"],

  // Emotions (based on your /assets/emotion/*.webp)
  emotions: ["Angry","Excited","Happy","Sad","Scared"],

  // NEW: Foods (Objects → Foods) (based on your /assets/food/*.webp)
  foods: ["Cabbage","Cereal","Chicken","Corn","Fruit","Lettuce","Meat","Onion","Potato","Turkey","Vegetables"],
};

export const getItems = (id) => LearnData[id] ?? [];
export const getTotal = (id) => getItems(id).length;
