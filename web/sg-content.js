// Words and pictures for the six Shart games (rules live in sg-engine.js, screens in sg-ui.js).
// Everything is 1 to 4 words. The couple's Jodi DNA (shared obsession) picks the theme.

// Ganda Sketch: things to draw in 20 seconds
export const SKETCH = [
  'Flying Chappal', '2 AM Maggi', 'Angry Partner', 'Auto Rickshaw', 'Pani Puri', 'Cutting Chai', 'Mosquito Attack', 'Wedding Baraat',
  'Pressure Cooker', 'Nosy Aunty', 'Bike Ride', 'Monsoon Rain', 'Cricket Bat', 'Selfie Stick', 'Lazy Sunday', 'Train Toilet',
  'Dancing Uncle', 'Mango Tree', 'Broken Phone', 'Ceiling Fan', 'Holi Colours', 'Diwali Diya', 'Traffic Jam', 'Samosa',
  'Gol Gappa', 'Kulfi', 'Hostel Bed', 'Office Boss', 'Ex Calling', 'Cute Puppy', 'Rose Day', 'Sleepy Face',
];
export const SKETCH_BY = {
  food: ['Vada Pav', 'Masala Dosa', 'Jalebi', 'Biryani Pot', 'Momo Plate', 'Chai Tapri', 'Paneer Tikka', 'Lassi Glass'],
  movies: ['Popcorn Bucket', 'Hero Entry', 'Villain Laugh', 'Dance Number', 'Movie Ticket', 'Slow Motion', 'Remote Fight', 'Sad Song'],
  hills: ['Snow Mountain', 'Tent Camp', 'Maggi Point', 'Toy Train', 'Bonfire Night', 'Pine Tree', 'Shimla Mall', 'Waterfall'],
  cricket: ['Sixer Shot', 'Clean Bowled', 'Stadium Crowd', 'Cricket Ball', 'Run Out', 'Trophy Lift', 'Umpire Finger', 'Gully Cricket'],
  gym: ['Push Ups', 'Protein Shake', 'Dumbbell', 'Treadmill', 'Six Pack', 'Yoga Pose', 'Leg Day', 'Gym Selfie'],
};

// Kaun Zyada? cards for the Mystery Wheel: both tap who fits best
export const WHO = [
  ['😴', 'Sleeps on call'], ['😤', 'Starts petty kalesh'], ['💸', 'Zomato addict'], ['📱', 'Phone addict'], ['🙄', 'More dramatic'],
  ['⏰', 'Always late'], ['😭', 'Cries at movies'], ['🍫', 'Hides snacks'], ['🙏', 'Says sorry first'], ['🛍️', 'Shopaholic'],
  ['🤳', 'Takes more selfies'], ['😡', 'Angrier when hungry'], ['🥱', 'Sleeps more'], ['🎤', 'Sings in bathroom'], ['🧹', 'Messier room'],
  ['🤥', 'Better liar'], ['🥺', 'More clingy'], ['💃', 'Better dancer'], ['🍳', 'Better cook'], ['🧠', 'Smarter one'],
];

// Mystery Wheel micro-dares (done live on the call)
export const DARES = [
  'Sing one line', 'Fake cry 5 sec', 'Say 3 compliments', 'Dance 5 sec', 'Talk like a baby', 'Do a villain laugh',
  'Propose filmy style', 'Imitate your mummy', 'Make an animal sound', 'Say I love you in 3 ways', 'Show your funny face', 'Rap one line',
];

// 6-emoji keypad for the Secret Emoji Vault
export const VAULT = {
  base: ['🥟', '☕', '🍕', '🌶️', '🍦', '🧋'],
  food: ['🥟', '☕', '🍛', '🌶️', '🍩', '🥭'],
  movies: ['🍿', '🎬', '🍜', '🎤', '💃', '🌹'],
  hills: ['⛰️', '🍜', '🔥', '🌲', '❄️', '🚂'],
  cricket: ['🏏', '⚾', '🏆', '🧢', '🎯', '🥤'],
  gym: ['💪', '🥤', '🏋️', '🥚', '👟', '🍌'],
};

// Cross-Zero pieces: [host piece, guest piece]
export const XO = {
  base: ['❤️', '🩴'], food: ['☕', '🥟'], movies: ['🍿', '🎬'], hills: ['⛰️', '🍜'], cricket: ['🏏', '⚾'], gym: ['💪', '🥤'],
};

// Grid Sniper: [treat, trap]
export const SNIPER = {
  base: ['🥟', '🌶️'], food: ['🍩', '🌶️'], movies: ['🍿', '💣'], hills: ['🍜', '❄️'], cricket: ['🏆', '🦆'], gym: ['🥚', '🍔'],
};

// Tug-of-War prize in the middle
export const TUG = {
  base: ['📺', 'TV Remote'], food: ['🍢', 'Last Paneer Tikka'], movies: ['🍿', 'Popcorn Bucket'], hills: ['🧣', 'Warm Blanket'], cricket: ['🏆', 'The Trophy'], gym: ['🥤', 'Protein Shake'],
};

export const themed = (map, obs) => map[obs] || map.base;
