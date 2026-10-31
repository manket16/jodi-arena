// Content for the long-distance games: Quick Quiz, Photo Hunt and Listen Together.
// Everything here works on two phones in two different cities.

// [question, [4 options], index of the right option]
export const QUIZ = [
  ['Which animal is the national animal of India?', ['Lion', 'Tiger', 'Elephant', 'Leopard'], 1],
  ['The Taj Mahal is in which city?', ['Delhi', 'Agra', 'Lucknow', 'Jaipur'], 1],
  ['Which festival is called the festival of lights?', ['Holi', 'Diwali', 'Eid', 'Pongal'], 1],
  ['Who was the first Indian to win an individual Olympic gold medal?', ['Abhinav Bindra', 'Neeraj Chopra', 'Rajyavardhan Rathore', 'Leander Paes'], 0],
  ['Who played Raj in Dilwale Dulhania Le Jayenge?', ['Aamir Khan', 'Shah Rukh Khan', 'Salman Khan', 'Saif Ali Khan'], 1],
  ['Who directed Sholay?', ['Yash Chopra', 'Ramesh Sippy', 'Raj Kapoor', 'Manmohan Desai'], 1],
  ['How many players are on the field for one cricket team?', ['9', '10', '11', '12'], 2],
  ['Which cricketer is known as the Master Blaster?', ['Rahul Dravid', 'Sachin Tendulkar', 'MS Dhoni', 'Virat Kohli'], 1],
  ['In which year did India win its first Cricket World Cup?', ['1975', '1983', '1987', '2011'], 1],
  ['Kathakali is a classical dance from which state?', ['Tamil Nadu', 'Kerala', 'Karnataka', 'Andhra Pradesh'], 1],
  ['The Gateway of India is in which city?', ['Mumbai', 'Chennai', 'Kolkata', 'Goa'], 0],
  ['Which sweet is made of milk-solid balls soaked in sugar syrup?', ['Jalebi', 'Gulab Jamun', 'Barfi', 'Ladoo'], 1],
  ['Dhokla is a famous snack from which state?', ['Punjab', 'Gujarat', 'West Bengal', 'Odisha'], 1],
  ['Bihu is a festival of which state?', ['Assam', 'Odisha', 'Kerala', 'Gujarat'], 0],
  ['Who wrote the national anthem Jana Gana Mana?', ['Bankim Chandra Chatterjee', 'Rabindranath Tagore', 'Sarojini Naidu', 'Muhammad Iqbal'], 1],
  ['Who wrote Vande Mataram?', ['Rabindranath Tagore', 'Bankim Chandra Chatterjee', 'Premchand', 'Subramania Bharati'], 1],
  ['Which planet is called the Red Planet?', ['Venus', 'Mars', 'Jupiter', 'Mercury'], 1],
  ['How many days are there in a leap year?', ['365', '366', '364', '367'], 1],
  ['Which ISRO mission landed near the Moon’s south pole region in 2023?', ['Mangalyaan', 'Chandrayaan-2', 'Chandrayaan-3', 'Aditya-L1'], 2],
  ['Mangalyaan was India’s mission to which planet?', ['Venus', 'Mars', 'Jupiter', 'Saturn'], 1],
  ['Who is known as the Missile Man of India?', ['A. P. J. Abdul Kalam', 'Homi Bhabha', 'Vikram Sarabhai', 'C. V. Raman'], 0],
  ['The Statue of Unity honours which leader?', ['Mahatma Gandhi', 'Sardar Vallabhbhai Patel', 'Jawaharlal Nehru', 'Subhas Chandra Bose'], 1],
  ['“Mogambo khush hua” is a famous dialogue from which film?', ['Sholay', 'Mr. India', 'Don', 'Karz'], 1],
  ['What is Shah Rukh Khan’s character called in Kuch Kuch Hota Hai?', ['Raj', 'Rahul', 'Rohit', 'Aman'], 1],
  ['Who sang Tum Hi Ho from Aashiqui 2?', ['Atif Aslam', 'Arijit Singh', 'Sonu Nigam', 'KK'], 1],
  ['Which singer is known as the Nightingale of India and sang Lag Ja Gale?', ['Asha Bhosle', 'Lata Mangeshkar', 'Shreya Ghoshal', 'Alka Yagnik'], 1],
  ['Who played Rancho in 3 Idiots?', ['Aamir Khan', 'R. Madhavan', 'Sharman Joshi', 'Boman Irani'], 0],
  ['Who directed Baahubali?', ['Shankar', 'S. S. Rajamouli', 'Atlee', 'Mani Ratnam'], 1],
  ['Kal Ho Naa Ho is set in which city?', ['Mumbai', 'London', 'New York', 'Sydney'], 2],
  ['Which city is called the Pink City of India?', ['Jodhpur', 'Jaipur', 'Udaipur', 'Bikaner'], 1],
  ['Which Mughal emperor built the Taj Mahal?', ['Akbar', 'Shah Jahan', 'Babur', 'Aurangzeb'], 1],
  ['Who was the first Prime Minister of India?', ['Mahatma Gandhi', 'Sardar Patel', 'Jawaharlal Nehru', 'Rajendra Prasad'], 2],
  ['The Golden Temple is in which city?', ['Chandigarh', 'Amritsar', 'Ludhiana', 'Patiala'], 1],
  ['The Konark Sun Temple is in which state?', ['Odisha', 'Bihar', 'Madhya Pradesh', 'West Bengal'], 0],
  ['Which is the largest Indian state by area?', ['Madhya Pradesh', 'Rajasthan', 'Maharashtra', 'Uttar Pradesh'], 1],
  ['In Mumbai, what does ordering a “cutting” usually mean?', ['A half cup of chai', 'A small vada pav', 'A haircut', 'A short taxi ride'], 0],
  ['In Kolkata, panipuri is famously called…', ['Puchka', 'Golgappa', 'Batasha', 'Pani ke patashe'], 0],
  ['Which cricketer is nicknamed Captain Cool?', ['Virat Kohli', 'MS Dhoni', 'Rohit Sharma', 'Sourav Ganguly'], 1],
  ['Which jersey number does Virat Kohli wear for India?', ['7', '18', '45', '10'], 1],
  ['Which language is spoken by the most people in India?', ['Bengali', 'Hindi', 'Tamil', 'Marathi'], 1],
  ['How many states does India have?', ['28', '29', '27', '30'], 0],
  ['Which colour is at the top of the Indian flag?', ['Green', 'White', 'Saffron', 'Blue'], 2],
  ['How many spokes does the Ashoka Chakra have?', ['12', '24', '16', '32'], 1],
  ['Bharatanatyam is a classical dance from which state?', ['Punjab', 'Tamil Nadu', 'Assam', 'Rajasthan'], 1],
  ['Which festival is celebrated by throwing colours?', ['Diwali', 'Holi', 'Onam', 'Lohri'], 1],
  ['Which planet has famous rings?', ['Jupiter', 'Saturn', 'Mars', 'Earth'], 1],
  ['Which animal is called the ship of the desert?', ['Horse', 'Camel', 'Donkey', 'Yak'], 1],
  ['How many continents are there?', ['5', '6', '7', '8'], 2],
  ['Which Indian city is known as the City of Joy?', ['Mumbai', 'Kolkata', 'Pune', 'Lucknow'], 1],
  ['Which river is considered the holiest in Hinduism?', ['Yamuna', 'Ganga', 'Godavari', 'Narmada'], 1],
  ['Which fruit is called the king of fruits in India?', ['Banana', 'Mango', 'Apple', 'Guava'], 1],
  ['Which spice gives biryani and kheer a golden colour?', ['Saffron', 'Cardamom', 'Clove', 'Cinnamon'], 0],
  ['Which Bollywood film features the song Chaiyya Chaiyya?', ['Dil Se', 'Rangeela', 'Taal', 'Bombay'], 0],
];

// photo hunt prompts: something each of you can find or do where you are, right now
export const SCAV = [
  'Something red near you', 'Something blue near you', 'Something yellow near you', 'Something green near you',
  'Something round', 'The oldest thing within reach', 'Your view right now', 'What is in your hand',
  'What you are drinking or eating', 'Something that makes you smile', 'Something that reminds you of your partner',
  'The messiest corner near you', 'Your shoes', 'A window and what it shows', 'A shadow', 'A reflection',
  'Something made of wood', 'Something made of metal', 'The smallest thing you can find', 'Something with a face (a real or accidental one)',
  'Your phone charger setup', 'A plant or flower', 'The sky right now', 'Something you would pack for a trip together',
  'Your favourite mug or glass', 'Something soft', 'A book or a magazine', 'Your lock-screen of the day, as a photo of the real thing',
];

// listen-together songs: [title, film]
export const SONGS = [
  ['Tum Hi Ho', 'Aashiqui 2'], ['Kal Ho Naa Ho', 'Kal Ho Naa Ho'], ['Tujhe Dekha Toh', 'Dilwale Dulhania Le Jayenge'],
  ['Channa Mereya', 'Ae Dil Hai Mushkil'], ['Kabira', 'Yeh Jawaani Hai Deewani'], ['Tum Se Hi', 'Jab We Met'],
  ['Kesariya', 'Brahmastra'], ['Pehla Nasha', 'Jo Jeeta Wohi Sikandar'], ['Tere Bina', 'Guru'],
  ['Agar Tum Saath Ho', 'Tamasha'], ['Phir Le Aya Dil', 'Barfi!'], ['Ilahi', 'Yeh Jawaani Hai Deewani'],
  ['Yeh Dosti', 'Sholay'], ['Chaiyya Chaiyya', 'Dil Se'], ['Raataan Lambiyan', 'Shershaah'],
  ['Maahi Ve', 'Highway'], ['Kun Faya Kun', 'Rockstar'], ['Jeena Jeena', 'Badlapur'],
  ['Tera Ban Jaunga', 'Kabir Singh'], ['Nashe Si Chadh Gayi', 'Befikre'], ['Mast Magan', '2 States'],
  ['Hawayein', 'Jab Harry Met Sejal'], ['Gerua', 'Dilwale'], ['Zehnaseeb', 'Hasee Toh Phasee'],
  ['Saans', 'Jab Tak Hai Jaan'], ['Dil Diyan Gallan', 'Tiger Zinda Hai'], ['Apna Bana Le', 'Bhediya'],
];

// how a song made you feel: [emoji, label]
export const FEELS = [['🥰', 'In love'], ['😢', 'Teary'], ['💃', 'Dancing'], ['🔥', 'Pumped'], ['😌', 'Calm'], ['🥹', 'Nostalgic'], ['😂', 'Cringe'], ['😴', 'Sleepy']];
