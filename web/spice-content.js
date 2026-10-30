// Content for the spice levels and the two spice games: stakes, photo prompts and lip-read phrases.
// Level 1 = Meetha, 2 = Teekha, 3 = Jwalamukhi.

export const LEVELS = [
  { n: 1, key: 'meetha', emo: '🍬', name: 'Meetha', tag: 'Cute & everyday', vibe: 'Safe for anywhere. Inside jokes & daily habits.' },
  { n: 2, key: 'teekha', emo: '🌶️', name: 'Teekha', tag: 'Savage roasts & drama', vibe: 'Friendly roasts and a little drama.', need: 3 },
  { n: 3, key: 'jwala', emo: '🔥', name: 'Jwalamukhi', tag: 'Unfiltered & late-night', vibe: 'Bold, cheeky and just for the two of you.', need: 8 },
];

// exactly 8 per level so the wheel always has 8 slices
export const STAKES_BY_LEVEL = {
  1: ['Bring a glass of water right now 💧', 'Make the next cup of chai or coffee ☕', 'Post a cute story of the winner 📱', 'Say 3 things you love about the winner 💗',
    'Give a 1-minute tight hug 🤗', 'Winner picks the next song or video 🎵', 'Feed the winner a snack 🍪', 'Write a sweet note for the winner ✍️'],
  2: ['5-minute head or shoulder massage 💆', 'Order and pay for tonight’s dessert 🍨', 'Send a voice note: “You are smarter than me” 🎙️', 'Do the winner’s dishes tonight 🍽️',
    'Wear the winner’s choice of silly outfit 🤡', 'Call the winner Maharaj or Maharani for an hour 👑', 'Do the winner’s chores for a day 🧹', 'Sing a song on a voice note 🎤'],
  3: ['15-minute massage 🔥', 'Winner checks your last 5 YouTube or Instagram searches 👀', 'Winner gets full blanket and AC control tonight ❄️', 'Confess your most embarrassing secret 😳',
    'Winner picks your profile picture for a day 🖼️', 'Plan the next date by the winner’s rules 💘', 'Send the winner a compliment every hour 💌', 'Do any dare the winner picks 😈'],
};

export const CAMERA = {
  1: ['A photo of the best meal we ate together recently', 'A photo where one of us is looking super sleepy', 'The oldest photo of us currently on your phone',
    'A random photo from our last trip or outing', 'A photo of something in your room right now that makes you happy', 'A photo of the cutest thing you saw this week',
    'A photo of your favourite snack or drink', 'A photo of a place you want to visit with me', 'A photo of the sky from your window today',
    'A photo of your pet, a friend’s pet, or any animal', 'A photo that always makes you smile', 'A photo of your outfit from this week',
    'A photo of a sunset or sunrise you liked', 'A photo of something blue on your phone', 'A photo of the last thing you cooked or ordered',
    'A photo of a memory from a festival', 'A photo of your favourite corner of your home'],
  2: ['A selfie where you look 10/10 and your partner looks terrible', 'A photo of your partner sleeping in a ridiculous position', 'A screenshot you took purely to gossip about later',
    'A photo showing your partner’s worst fashion choice', 'The most chaotic, blurry photo on your camera roll', 'A photo of your partner making their silliest face',
    'A meme you saved but never sent to anyone', 'A photo of the messiest place in your room', 'A photo where you look like you are about to cry from laughing',
    'A photo that proves your partner is always late', 'A screenshot of a chat that is pure drama', 'A photo of food that looked better in your head',
    'A photo of your partner eating something messy', 'A photo of someone’s terrible haircut (yours counts)', 'A photo from a day nothing went right'],
  3: ['A photo of your partner where you thought “Damn, I’m lucky”', 'A screenshot of a text conversation between us that still makes you smile (or mad)', 'A photo from a day we almost had a huge fight',
    'The most embarrassing photo of YOURSELF that you’ve never posted', 'A photo that reminds you of the moment you fell for your partner', 'A selfie you took late at night',
    'A photo of something you secretly bought and never told anyone', 'A screenshot of a message you typed but never sent', 'A photo you would only show your partner',
    'A photo of the last thing that made you miss your partner', 'A photo where your partner looks unfairly good', 'A photo of a gift you still treasure',
    'A photo from the best night we have had together', 'A photo of something you want us to do together soon', 'A screenshot of the sweetest thing someone said to you'],
};

export const MODS = ['😡 Mouth this like you are furiously angry', '🐢 Mouth this in extreme slow-motion', '📺 Mouth this like a dramatic breaking-news anchor', '🤫 Mouth this like top-secret neighborhood gossip'];

// w = phrase, d = lookalike decoy words (only for the two-phone chips)
export const KAUN = {
  1: [{ w: 'Mummy ne bola dhaniya le aana', d: ['Papa', 'gola', 'jana', 'dahi'] }, { w: 'Mera phone charge pe laga do', d: ['Tera', 'bone', 'barge', 'kar'] },
    { w: 'Aaj raat bahar khana khate hain', d: ['Kal', 'baat', 'pani', 'chalte'] }, { w: 'Chai ke saath pakode banate hain', d: ['Bhai', 'saathi', 'bataate', 'kapde'] },
    { w: 'Thoda sa pani pila do', d: ['Nani', 'pili', 'kaka', 'dila'] }, { w: 'Aaj ka khana kaisa tha', d: ['Kal', 'gaana', 'jaisa', 'raha'] },
    { w: 'Bhaiya zara do samose dena', d: ['Bhaisa', 'kara', 'dosa', 'dana'] }, { w: 'Sab log chai pe aa jao', d: ['Sabhi', 'chali', 'che', 'jaa'] }],
  2: [{ w: 'Tumhari galti thi meri bilkul nahi', d: ['Hamari', 'gatti', 'mehri', 'kabhi'] }, { w: 'Tum hamesha mera khana kha jaate ho', d: ['Hum', 'tera', 'gaate', 'hamsha'] },
    { w: 'Apna geela tauliya bed se hatao', d: ['Mera', 'gila', 'shed', 'batao'] }, { w: 'Pehle sorry bolo phir baat karenge', d: ['Pehli', 'sari', 'dolo', 'raat'] },
    { w: 'Phone mein itna kya dekhte rehte ho', d: ['Bone', 'dena', 'kyun', 'sote'] }, { w: 'Main kuch nahi bolunga tum hi bolo', d: ['Hum', 'kaun', 'nahin', 'kholo'] },
    { w: 'Aaj bhi late aaye tum', d: ['Kal', 'gate', 'aayi', 'hum'] }, { w: 'Mujhse zyada tumhe sab pasand hain', d: ['Tumse', 'kam', 'sabzi', 'passed'] }],
  3: [{ w: 'Tumhare bina bilkul mann nahi lagta', d: ['Humare', 'benaa', 'maan', 'laga'] }, { w: 'Aaj raat koi jaldi nahi soyega', d: ['Kal', 'baat', 'roya', 'jhoota'] },
    { w: 'Mera phone check karna band karo', d: ['Tera', 'bone', 'chalna', 'hand'] }, { w: 'Tum gusse mein bohot cute lagte ho', d: ['Hum', 'kisse', 'mote', 'lagta'] },
    { w: 'Mujhe tumhari bahut yaad aa rahi hai', d: ['Tumhe', 'baat', 'yaar', 'ja'] }, { w: 'Sirf mere ho tum yaad rakhna', d: ['Mirf', 'tere', 'hum', 'bhool'] },
    { w: 'Ek baar aur bolo wahi baat', d: ['Do', 'boro', 'rahi', 'raat'] }, { w: 'Chalo kahin door ghoomne chalte hain', d: ['Chalu', 'kahi', 'dur', 'dhoondne'] }],
};
export const DECOY_BANK = ['Pani', 'Nani', 'Biryani', 'Bimari', 'Chai', 'Mera', 'Tera', 'Kal', 'Aaj', 'Phir', 'Haan', 'Nahi'];
