// Website templates shared by the builder (create2.js) and the public page (site.js).
// Every template uses the same answers; each one lays them out in its own style.

export const TEMPLATES = [
  { k: 'classic', emo: '🌹', name: 'Classic Romance', line: 'Soft pinks, your story, reasons and a letter', bg: 'linear-gradient(135deg,#FFE3EC,#FFF6F2)', fg: '#9F1239' },
  { k: 'filmy', emo: '🎬', name: 'Bollywood Blockbuster', line: 'Your love story as a movie, with scenes and a dialogue', bg: 'linear-gradient(135deg,#1A0B2E,#7C1D3F)', fg: '#F9C74F' },
  { k: 'stars', emo: '🌌', name: 'Under the Stars', line: 'A night sky that counts every day together', bg: 'linear-gradient(135deg,#0B1026,#2B2F77)', fg: '#E0E7FF' },
  { k: 'scrapbook', emo: '📒', name: 'Scrapbook', line: 'Polaroids, sticky notes and handwriting', bg: 'linear-gradient(135deg,#F5E6C8,#E9D5A8)', fg: '#5B3A1A' },
  { k: 'envelope', emo: '💌', name: 'Sealed Letter', line: 'They tap the envelope and your letter unfolds', bg: 'linear-gradient(135deg,#FCE7F3,#FDF2F8)', fg: '#BE185D' },
  { k: 'birthday', emo: '🎂', name: 'Birthday Surprise', line: 'Countdown, candles to blow and birthday wishes', bg: 'linear-gradient(135deg,#FEF3C7,#FBCFE8)', fg: '#B45309' },
  { k: 'timeline', emo: '💍', name: 'Anniversary Timeline', line: 'Days together and your journey, moment by moment', bg: 'linear-gradient(135deg,#ECFDF5,#FEF9C3)', fg: '#065F46' },
  { k: 'proposal', emo: '💖', name: 'The Big Question', line: 'Ends with a question, and the No button runs away', bg: 'linear-gradient(135deg,#FFE4E6,#FECDD3)', fg: '#BE123C' },
  { k: 'sorry', emo: '🥺', name: 'Sorry, Na?', line: 'A cute manao page with a forgive button', bg: 'linear-gradient(135deg,#E0F2FE,#F0F9FF)', fg: '#075985' },
  { k: 'distance', emo: '✈️', name: 'Long Distance', line: 'Two cities, one heart, and a countdown to meeting', bg: 'linear-gradient(135deg,#DBEAFE,#FCE7F3)', fg: '#1E3A8A' },
  { k: 'letter', emo: '🖋️', name: 'Just a Letter', line: 'Simple and elegant, all about your words', bg: 'linear-gradient(135deg,#FAFAF9,#F5F5F4)', fg: '#292524' },
  { k: 'mixtape', emo: '📼', name: 'Our Mixtape', line: 'Your songs as a cassette, memories as tracks', bg: 'linear-gradient(135deg,#FDE68A,#FCA5A5)', fg: '#7C2D12' },
];

export const OCCASIONS = ['Just because', 'Anniversary', 'Birthday', 'Valentine’s Day', 'Proposal', 'Apology', 'Long distance', 'Miss you', 'Thank you', 'Wedding anniversary'];

export const TEMPLATE_BY_OCCASION = {
  'Anniversary': 'timeline', 'Birthday': 'birthday', 'Valentine’s Day': 'classic', 'Proposal': 'proposal', 'Apology': 'sorry',
  'Long distance': 'distance', 'Miss you': 'stars', 'Thank you': 'letter', 'Wedding anniversary': 'timeline', 'Just because': 'scrapbook',
};

// Extra questions some templates ask. Every template also asks the common questions.
export const EXTRA = {
  filmy: [['movie_title', 'Your movie’s name', 'Dilwale Dulhania Le Gayi'], ['dialogue', 'A filmy dialogue for your partner', 'Bade bade sheheron mein…']],
  birthday: [['event_date', 'Their birthday (for the countdown)', '', 'date'], ['age', 'Which birthday is it? (optional)', '25']],
  proposal: [['question', 'Your big question', 'Will you marry me?'], ['yes_message', 'What they see after Yes', 'Best decision of your life. Ab koi return policy nahi.']],
  sorry: [['sorry_reason', 'What are you sorry for?', 'For snapping at you on Sunday'], ['promise', 'Your promise', 'Next time I will listen first, then talk.']],
  distance: [['city_me', 'Your city', 'Bengaluru'], ['city_partner', 'Their city', 'Patna'], ['km', 'Distance in km (optional)', '1900'], ['event_date', 'Next time you meet (for the countdown)', '', 'date'], ['dreams', 'Things you’ll do when you meet, one per line', 'Golgappe at our spot\nLong walk without phones', 'area']],
  mixtape: [['songs', 'Your songs, one per line (Song - Film)', 'Tum Se Hi - Jab We Met\nKabira - YJHD', 'area']],
  timeline: [['dreams', 'Dreams for your future, one per line (optional)', 'A little house with a garden\nEurope trip', 'area']],
  stars: [['dreams', 'Wishes for the two of you, one per line (optional)', 'Seeing the northern lights together', 'area']],
};
