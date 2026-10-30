import re, json

SONGS = """
Aaj Kal Tere Mere Pyar Ke Charche|Aaja Nachle|Aankhon Mein Teri|Aap Jaisa Koi|Aadat|Abhi Mujh Mein Kahin|Agar Tum Saath Ho|Ae Dil Hai Mushkil|Ainvayi Ainvayi|Ajeeb Dastaan Hai Yeh|Akhiyaan Milaoon Kabhi|Albela Sajan|Ankhiyon Ke Jharokhon Se|Apna Time Aayega|Aye Mere Watan Ke Logo|Aashayein|Aal Izz Well|Aaoge Jab Tum|Aankh Marey|Aapki Nazron Ne Samjha|Aaj Phir Jeene Ki Tamanna Hai|Ajab Si|Aa Ab Laut Chalen|Aayat|Ae Ajnabi|Aashiq Banaya Aapne|Ang Laga De|Aa Jaane Jaan|Achha Sila Diya|Arziyan|Aye Khuda|Abhi Na Jao Chhod Kar
Badtameez Dil|Balam Pichkari|Bachna Ae Haseeno|Baby Doll|Bole Chudiyan|Bheegi Bheegi Raaton Mein|Bhaag DK Bose|Bin Tere|Bulleya|Banjaara|Bekhayali|Baarish|Bade Achhe Lagte Hain|Bheegi Si Bhaagi Si|Brown Rang|Besabriyaan|Bol Do Na Zara|Bum Bum Bole|Badi Mushkil|Bhool Bhulaiyaa|Bachke Rehna Re Baba
Chaiyya Chaiyya|Chammak Challo|Chikni Chameli|Chalte Chalte|Channa Mereya|Chura Liya Hai Tumne Jo Dil Ko|Chunari Chunari|Choli Ke Peeche|Chak De India|Chaudhvin Ka Chand|Chand Sifarish|Challa|Chogada|Chitthi Aayi Hai|Choo Lo|Chashni|Chaand Baaliyan|Chhaap Tilak
Dilbar|Dil To Pagal Hai|Dil Chahta Hai|Dola Re Dola|Desi Girl|Dhoom Machale|Dard E Disco|Dhinka Chika|Dil Diyan Gallan|Dilliwaali Girlfriend|Dekha Ek Khwab|Dil Se Re|Dum Maro Dum|Darmiyaan|Dil Ibaadat|Dheere Dheere Se|Do Pal|Dil Kya Kare|Dekha Hazaro Dafaa|Dhadak|Deewani Mastani|Dil Ko Karaar Aaya|Dil Dhadakne Do|Dus Bahane
Ek Do Teen|Ek Ladki Ko Dekha|Ek Pyaar Ka Nagma Hai|Ek Ajnabee Haseena Se|Ek Main Aur Ek Tu|Ek Tarfa|Emotional Atyachar|Ek Dil Ek Jaan|Ek Chatur Naar|Ek Haseena Thi|Ek Pal Ka Jeena
Falak Tak|Fevicol Se|First Class|Fitoor|Fakira|Phir Bhi Tumko Chaahunga
Gerua|Galliyan|Gulabi Aankhen|Gallan Goodiyaan|Ghungroo|Genda Phool|Ghar More Pardesiya|Gazab Ka Hai Din|Gulaabo|Ghagra|Girls Like To Swing|Gali Mein Aaj Chand Nikla|Ghoomar
Hawa Hawai|Hawayein|Humma Humma|Hamari Adhuri Kahani|Hasi|Hum Tumhare Hain Sanam|Hookah Bar|Haan Ke Haan|Hai Apna Dil To Awara|Hothon Se Chhu Lo Tum|Humko Humise Chura Lo|Hosanna|Haule Haule|Hey Shona|Hai Rama|Hai Junoon|Hum Hain Rahi Pyar Ke|Hungama Ho Gaya
Ishq Wala Love|Iktara|Ilahi|Ishq Bina|Ishq Sufiyana|Ik Junoon|Ishq Shava|Itni Si Baat Hain|Inn Ankhon Ki Masti|Ik Vaari Aa|Ishqyaun Dhishqyaun|Ishq Kameena|Isq Risk|Ijazat
Jab Koi Baat Bigad Jaye|Jai Ho|Jhoome Jo Pathaan|Jashn E Bahaara|Jiya Jale|Jag Ghoomeya|Jeene Laga Hoon|Janam Janam|Jaane Kyun|Jhalla Wallah|Jumme Ki Raat|Jaadu Teri Nazar|Judaai|Jhumka Gira Re|Jiya Re|Jaane Jaan Dhoondta Phir Raha|Jhanjhariya|Jalwa
Kabhi Kabhi Mere Dil Mein|Kal Ho Naa Ho|Kajra Re|Kabira|Kun Faya Kun|Khairiyat|Kaho Naa Pyaar Hai|Koi Mil Gaya|Kuch Kuch Hota Hai|Kesariya|Kaala Chashma|Kar Gayi Chull|Kamli|Khwaja Mere Khwaja|Kabhi Alvida Naa Kehna|Kya Mujhe Pyar Hai|Kabhi Kabhi Aditi|Kaun Hai Jo Sapno Mein Aaya|Kuch Na Kaho|Kehna Hi Kya|Khaike Paan Banaraswala|Kudi Nu Nachne De|Kaise Hua|Kya Hua Tera Wada|Kar Har Maidaan Fateh|Kajra Mohabbat Wala
Lag Ja Gale|Lal Ishq|Lambi Judaai|Laila Main Laila|Lungi Dance|London Thumakda|Lat Lag Gayee|Locha E Ulfat|Labon Ko|Lae Dooba|Lakdi Ki Kaathi|Luka Chuppi|Lucky Tu Lucky Me
Mere Sapnon Ki Rani|Matargashti|Mast Magan|Mehendi Laga Ke Rakhna|Mitwa|Mauja Hi Mauja|Mere Rashke Qamar|Malhari|Manwa Laage|Mera Joota Hai Japani|Mujhse Shaadi Karogi|Main Agar Kahoon|Main Tera Boyfriend|Muqabla|Mann Mera|Masakali|Meri Mehbooba|Mehbooba Mehbooba|Main Hoon Na|Muskurane|Mast Kalandar|Moh Moh Ke Dhaage|Maahi Ve|Mere Khwabon Mein Jo Aaye|Mungda
Nagada Sang Dhol|Naina|Nashe Si Chadh Gayi|Naacho Naacho|Nainowale Ne|Nazm Nazm|Neele Neele Ambar Par|Nain Lad Jai Hain|Nadaan Parinde|Na Jaane Kahan Se Aayi Hai|Nachde Ne Saare|Navrai Majhi|Nimbooda|Nazar Ke Samne
O Saathi Re|O Re Piya|Om Shanti Om|O Haseena Zulfonwali|O Mere Dil Ke Chain|O Saki Saki|Ooh La La|O Rangrez|O Re Chhori|O Meri Laila|Odhani|Oonchi Hai Building|Ore Manwa Re|O Sanam
Pehla Nasha|Pal Pal Dil Ke Paas|Pee Loon|Pyaar Hua Ikraar Hua|Phir Bhi Dil Hai Hindustani|Pardesi Pardesi|Pinga|Param Sundari|Phir Le Aya Dil|Pungi|Patakha Guddi|Piya Basanti|Pyaar Do Pyaar Lo|Pashmina|Pani Da Rang|Pareshaan|Pardesiya|Pyar Kiya To Darna Kya
Qaafirana|Qayamat Qayamat
Raabta|Rang De Basanti|Roop Tera Mastana|Radha|Rimjhim Gire Sawan|Ranjha|Raataan Lambiyan|Rang Barse|Raat Akeli Hai|Rozana|Rock On|Ruk Ja O Dil Deewane|Roobaroo|Rangisari|Ram Chahe Leela|Rabba Ve|Raja Ko Rani Se Pyar Ho Gaya
Suraj Hua Maddham|Sooraj Dooba Hain|Sheila Ki Jawani|Saathiya|Senorita|Sun Raha Hai|Saibo|Subhanallah|Shayad|Swag Se Swagat|Sajda|Saajan Ji Ghar Aaye|Salaam E Ishq|Say Shava Shava|Sauda Khara Khara|Sach Keh Raha Hai Deewana|Sanu Ek Pal Chain|Soni De Nakhre|Suno Na Sangemarmar|Sawan Aaya Hai|Satrangi Re|Shukran Allah|Sweety Tera Drama|Saiyaara|Sapna Jahan
Tujhe Dekha To|Tum Hi Ho|Tum Se Hi|Tera Ban Jaunga|Tere Bina|Tip Tip Barsa Paani|Tune Maari Entriyaan|Tujh Mein Rab Dikhta Hai|Tere Naam|Tu Jaane Na|Tera Hone Laga Hoon|Taal Se Taal Mila|Tere Liye|Tum Jo Aaye|Teri Mitti|Tum Mile|Tadap Tadap Ke|Tu Hi Re|Tere Mast Mast Do Nain|Tamma Tamma|Tattad Tattad|Tera Yaar Hoon Main|Tu Cheez Badi Hai Mast Mast|Tere Sang Yaara|Tum Kya Mile|Tujhko Jo Paaya
Udi Udi Jaye|Uff Teri Adaa|Ude Dil Befikre|Uncha Lamba Kad|Ui Amma|Urvashi Urvashi
Vande Mataram|Vaaste|Vele|Vaada Raha
Woh Lamhe|Woh Ladki Hai Kahan|Wah Wah Ramji|What Jhumka|Wakhra Swag|Woh Pehli Baar
Yeh Dosti|Yeh Jawaani Hai Deewani|Yeh Shaam Mastani|Yaar Bina Chain Kahan Re|Yun Hi Chala Chal|Ye Tune Kya Kiya|Yaariyan|Yeh Fitoor Mera|Yeh Hai Bombay Meri Jaan|Yeh Ladka Hai Allah|Yeh Raatein Yeh Mausam
Zara Zara|Zinda|Zingaat|Zihaal E Miskin|Zara Sa|Zoobi Doobi|Zehnaseeb|Zaalima|Zara Zara Touch Me|Zor Ka Jhatka
"""

SYNC = [
 ("Morning drink?", "Chai", "Coffee"), ("Holiday?", "Goa", "Manali"), ("Street food?", "Pani puri", "Momos"),
 ("Weekend plan?", "Movie at home", "Go out"), ("Dream date?", "Candlelight dinner", "Long drive"),
 ("Movie mood?", "Romance", "Thriller"), ("King of romance?", "Shah Rukh", "Salman"), ("Sport to watch?", "Cricket", "Football"),
 ("Escape to?", "Mountains", "Beach"), ("Craving?", "Sweet", "Spicy"), ("Best season?", "Monsoon", "Winter"),
 ("You two are…", "Night owls", "Early birds"), ("Quick catch-up?", "Phone call", "Video call"), ("Message style?", "Text", "Voice note"),
 ("Best gift?", "Surprise gift", "Trip together"), ("Dinner tonight?", "Ghar ka khana", "Restaurant"), ("Favourite festival?", "Diwali", "Holi"),
 ("Mithai?", "Gulab jamun", "Rasgulla"), ("Snack?", "Samosa", "Kachori"), ("Breakfast?", "Maggi", "Poha"), ("Binge on?", "Netflix", "YouTube"),
 ("Phone time?", "Reels", "Memes"), ("Music?", "Old songs", "New songs"), ("Voice?", "Arijit Singh", "Kishore Kumar"),
 ("At a party you…", "Dance", "Sing"), ("Dream wedding?", "Grand shaadi", "Simple and small"), ("Honeymoon?", "India", "Abroad"),
 ("Pet?", "Dog", "Cat"), ("Future home?", "City flat", "House with garden"), ("Plans?", "Fixed plan", "Go with the flow"),
 ("Shopping?", "Online", "Market"), ("Sunday morning?", "Sleep in", "Brunch out"), ("Travel by?", "Train", "Flight"),
 ("Chai partner?", "Biscuits", "Pakoras"), ("Ice cream?", "Chocolate", "Vanilla"), ("After a fight?", "Talk it out now", "Cool off first"),
 ("Love language?", "Sweet words", "Tight hugs"), ("Anniversary?", "Trip", "Party"), ("Bollywood era?", "90s", "Today"),
 ("Superpower?", "Fly", "Read minds"), ("Perfect evening?", "Chai on the balcony", "Street food walk"), ("Game night?", "Ludo", "Carrom"),
 ("Watch together?", "Sunrise", "Sunset"), ("Home decor?", "Plants", "Fairy lights"), ("City vibe?", "Mumbai", "Delhi"),
 ("Who is the better cook?", "Him", "Her"), ("Who says sorry first?", "Him", "Her"), ("Who is more filmy?", "Him", "Her"),
 ("Who spends more?", "Him", "Her"), ("Who wakes up later?", "Him", "Her"), ("Who is the better driver?", "Him", "Her"),
 ("Who gets angry faster?", "Him", "Her"), ("Who remembers dates better?", "Him", "Her"), ("Who is more romantic?", "Him", "Her"),
 ("Who plans the trips?", "Him", "Her"), ("Who is the bigger foodie?", "Him", "Her"), ("Who falls asleep during movies?", "Him", "Her"),
 ("Who laughs louder?", "Him", "Her"), ("Who is more stubborn?", "Him", "Her"), ("Who said I love you first?", "Him", "Her"),
 ("Who is the bigger shopaholic?", "Him", "Her"), ("Who takes more selfies?", "Him", "Her"), ("Who is always late?", "Him", "Her"),
]

# (question, options, answer_index, difficulty)
TRIVIA = [
 ("What is the capital of India?", ["Mumbai","New Delhi","Kolkata","Chennai"], 1, 1),
 ("India's national animal?", ["Lion","Tiger","Elephant","Peacock"], 1, 1),
 ("India's national bird?", ["Parrot","Sparrow","Peacock","Eagle"], 2, 1),
 ("How many players does a cricket team have on the field?", ["9","10","11","12"], 2, 1),
 ("The Taj Mahal is in which city?", ["Delhi","Jaipur","Agra","Lucknow"], 2, 1),
 ("Who is called the Father of the Nation?", ["Nehru","Mahatma Gandhi","Sardar Patel","Subhas Bose"], 1, 1),
 ("Which festival is known as the festival of lights?", ["Holi","Diwali","Eid","Onam"], 1, 1),
 ("Largest planet in our solar system?", ["Earth","Saturn","Jupiter","Mars"], 2, 1),
 ("How many days are in a leap year?", ["364","365","366","367"], 2, 1),
 ("Which city is called the Pink City?", ["Jodhpur","Jaipur","Udaipur","Bikaner"], 1, 1),
 ("India's national fruit?", ["Banana","Mango","Apple","Jackfruit"], 1, 1),
 ("Shah Rukh Khan's character name in DDLJ?", ["Rahul","Raj","Aman","Rohit"], 1, 2),
 ("Who played Gabbar Singh in Sholay?", ["Amitabh Bachchan","Dharmendra","Amjad Khan","Sanjeev Kumar"], 2, 2),
 ("'Mogambo khush hua' is from which film?", ["Mr. India","Shahenshah","Karma","Tezaab"], 0, 2),
 ("'Naatu Naatu' won the Oscar. Which film is it from?", ["RRR","Baahubali","KGF","Pushpa"], 0, 1),
 ("Sachin Tendulkar's jersey number?", ["7","10","18","45"], 1, 2),
 ("Who captained India to the 1983 World Cup win?", ["Sunil Gavaskar","Kapil Dev","Ravi Shastri","Mohinder Amarnath"], 1, 1),
 ("India beat which team in the 2011 World Cup final?", ["Australia","Pakistan","Sri Lanka","England"], 2, 2),
 ("MS Dhoni's jersey number?", ["7","10","18","33"], 0, 1),
 ("Virat Kohli's jersey number?", ["7","10","18","45"], 2, 2),
 ("Rohit Sharma's jersey number?", ["45","18","7","99"], 0, 2),
 ("How many balls are in an over?", ["4","5","6","8"], 2, 1),
 ("India won the 2024 T20 World Cup final against?", ["Australia","South Africa","England","New Zealand"], 1, 2),
 ("Eden Gardens stadium is in?", ["Mumbai","Kolkata","Chennai","Delhi"], 1, 2),
 ("Narendra Modi Stadium is in?", ["Ahmedabad","Surat","Delhi","Varanasi"], 0, 2),
 ("Highest peak located fully in India?", ["Nanda Devi","Kanchenjunga","Kamet","Annapurna"], 1, 3),
 ("How many states does India have?", ["26","28","29","30"], 1, 2),
 ("India's first Prime Minister?", ["Jawaharlal Nehru","Sardar Patel","Lal Bahadur Shastri","Indira Gandhi"], 0, 1),
 ("India's first woman Prime Minister?", ["Indira Gandhi","Pratibha Patil","Sarojini Naidu","Sonia Gandhi"], 0, 1),
 ("First Indian in space?", ["Kalpana Chawla","Rakesh Sharma","Sunita Williams","Ravish Malhotra"], 1, 2),
 ("Chandrayaan-3 landed near which part of the Moon?", ["North pole","South pole","Equator","Far side"], 1, 2),
 ("ISRO's headquarters is in?", ["Hyderabad","Bengaluru","Chennai","Thiruvananthapuram"], 1, 2),
 ("Who wrote India's national anthem?", ["Bankim Chandra","Rabindranath Tagore","Iqbal","Sarojini Naidu"], 1, 1),
 ("Who wrote Vande Mataram?", ["Rabindranath Tagore","Bankim Chandra Chattopadhyay","Premchand","Iqbal"], 1, 2),
 ("Who wrote 'Saare Jahan Se Achha'?", ["Muhammad Iqbal","Rabindranath Tagore","Gulzar","Sahir Ludhianvi"], 0, 3),
 ("Kathakali dance comes from which state?", ["Tamil Nadu","Kerala","Karnataka","Odisha"], 1, 2),
 ("Bihu is the festival of which state?", ["Assam","West Bengal","Odisha","Manipur"], 0, 2),
 ("Pongal is mainly celebrated in?", ["Kerala","Tamil Nadu","Andhra Pradesh","Karnataka"], 1, 1),
 ("The Golden Temple is in?", ["Amritsar","Ludhiana","Chandigarh","Patiala"], 0, 1),
 ("The Gateway of India is in?", ["Delhi","Mumbai","Kolkata","Hyderabad"], 1, 1),
 ("Charminar is in?", ["Hyderabad","Lucknow","Bhopal","Mysuru"], 0, 1),
 ("Hawa Mahal is in?", ["Jaipur","Udaipur","Agra","Gwalior"], 0, 1),
 ("Victoria Memorial is in?", ["Mumbai","Kolkata","Chennai","Shimla"], 1, 2),
 ("Dal Lake is in?", ["Srinagar","Nainital","Udaipur","Shillong"], 0, 1),
 ("The Sundarbans are famous for?", ["Lions","Royal Bengal Tigers","Rhinos","Elephants"], 1, 1),
 ("Which park is famous for one-horned rhinos?", ["Kaziranga","Gir","Jim Corbett","Ranthambore"], 0, 2),
 ("Asiatic lions live in?", ["Kaziranga","Gir","Sundarbans","Kanha"], 1, 2),
 ("Which is called the Red Planet?", ["Venus","Mars","Mercury","Jupiter"], 1, 1),
 ("Water boils at how many degrees Celsius?", ["90","100","110","120"], 1, 1),
 ("Hindi Diwas is on?", ["14 September","15 August","26 January","2 October"], 0, 3),
 ("Republic Day is on?", ["15 August","26 January","2 October","14 November"], 1, 1),
 ("Children's Day marks whose birthday?", ["Gandhi","Nehru","Kalam","Patel"], 1, 2),
 ("Teachers' Day marks whose birthday?", ["S. Radhakrishnan","APJ Abdul Kalam","Tagore","Vivekananda"], 0, 2),
 ("Who is known as the Missile Man of India?", ["Homi Bhabha","Vikram Sarabhai","APJ Abdul Kalam","CV Raman"], 2, 1),
 ("Which Indian won the 1930 Nobel Prize in Physics?", ["CV Raman","SN Bose","Meghnad Saha","S Chandrasekhar"], 0, 2),
 ("Who composed the music of 'Jai Ho'?", ["Pritam","AR Rahman","Shankar-Ehsaan-Loy","Vishal-Shekhar"], 1, 1),
 ("'Kesariya' is from which film?", ["Brahmastra","Shershaah","Pathaan","Animal"], 0, 2),
 ("'Tum Hi Ho' is from which film?", ["Aashiqui 2","Rockstar","Ek Villain","Kabir Singh"], 0, 1),
 ("'Chaiyya Chaiyya' was shot on top of a?", ["Car","Train","Boat","Bus"], 1, 1),
 ("Which sport is played in Lagaan?", ["Hockey","Cricket","Football","Kabaddi"], 1, 1),
 ("Dangal is based on?", ["Mary Kom","The Phogat sisters","Milkha Singh","Saina Nehwal"], 1, 1),
 ("Milkha Singh's famous nickname?", ["Flying Sikh","Iron Man","Golden Boy","Payyoli Express"], 0, 2),
 ("Who played Milkha Singh in Bhaag Milkha Bhaag?", ["Ranveer Singh","Farhan Akhtar","Hrithik Roshan","Sushant Singh Rajput"], 1, 2),
 ("Who directed Kabhi Khushi Kabhie Gham?", ["Karan Johar","Aditya Chopra","Farah Khan","Yash Chopra"], 0, 2),
 ("Who directed Baahubali?", ["SS Rajamouli","Shankar","Prashanth Neel","Mani Ratnam"], 0, 1),
 ("Which actor is called King Khan?", ["Salman Khan","Shah Rukh Khan","Aamir Khan","Saif Ali Khan"], 1, 1),
 ("Who is called Mr. Perfectionist?", ["Aamir Khan","Akshay Kumar","Ajay Devgn","Hrithik Roshan"], 0, 1),
 ("Neeraj Chopra competes in?", ["Shot put","Javelin","Discus","High jump"], 1, 1),
 ("Neeraj Chopra won Olympic gold at?", ["Rio 2016","Tokyo 2020","Paris 2024","London 2012"], 1, 2),
 ("PV Sindhu plays?", ["Tennis","Badminton","Squash","Table tennis"], 1, 1),
 ("Mary Kom's sport?", ["Wrestling","Boxing","Judo","Weightlifting"], 1, 1),
 ("Which hockey legend was called 'The Wizard'?", ["Dhyan Chand","Balbir Singh","Dhanraj Pillay","Sardar Singh"], 0, 2),
 ("Chennai Super Kings' main colour?", ["Blue","Yellow","Purple","Red"], 1, 1),
 ("Which team won IPL 2025?", ["Mumbai Indians","Royal Challengers Bengaluru","Punjab Kings","Gujarat Titans"], 1, 2),
 ("India's first Test captain?", ["CK Nayudu","Lala Amarnath","Vijay Hazare","MAK Pataudi"], 0, 3),
 ("Rohit Sharma's record highest ODI score?", ["200","219","237","264"], 3, 3),
 ("How many Vedas are there?", ["2","3","4","5"], 2, 1),
 ("Who wrote the Mahabharata?", ["Valmiki","Ved Vyas","Tulsidas","Kalidas"], 1, 1),
 ("Who wrote Ramcharitmanas?", ["Valmiki","Tulsidas","Surdas","Kabir"], 1, 2),
 ("Who wrote Abhijnanashakuntalam?", ["Kalidas","Bhasa","Banabhatta","Tulsidas"], 0, 3),
 ("India's largest state by area?", ["Madhya Pradesh","Rajasthan","Maharashtra","Uttar Pradesh"], 1, 2),
 ("India's most populous state?", ["Bihar","Uttar Pradesh","Maharashtra","West Bengal"], 1, 1),
 ("India's smallest state by area?", ["Sikkim","Goa","Tripura","Mizoram"], 1, 2),
 ("Capital of Arunachal Pradesh?", ["Itanagar","Imphal","Aizawl","Kohima"], 0, 3),
 ("Capital of Kerala?", ["Kochi","Thiruvananthapuram","Kozhikode","Thrissur"], 1, 2),
 ("Capital of Odisha?", ["Cuttack","Bhubaneswar","Puri","Rourkela"], 1, 2),
 ("Capital of Chhattisgarh?", ["Raipur","Bilaspur","Durg","Bhilai"], 0, 2),
 ("Which city is called the Silicon Valley of India?", ["Hyderabad","Pune","Bengaluru","Chennai"], 2, 1),
 ("Which state produces the most tea?", ["Assam","Kerala","West Bengal","Tamil Nadu"], 0, 2),
 ("Who built UPI?", ["RBI","NPCI","SBI","Paytm"], 1, 3),
 ("RBI's headquarters is in?", ["Delhi","Mumbai","Kolkata","Chennai"], 1, 2),
 ("Whose portrait is on Indian currency notes?", ["Nehru","Mahatma Gandhi","Ambedkar","Patel"], 1, 1),
 ("Chief architect of the Indian Constitution?", ["Nehru","BR Ambedkar","Rajendra Prasad","Sardar Patel"], 1, 1),
 ("The Constitution came into effect in?", ["1947","1949","1950","1952"], 2, 2),
 ("India's first President?", ["Rajendra Prasad","S. Radhakrishnan","Zakir Husain","VV Giri"], 0, 2),
 ("The Statue of Unity depicts?", ["Gandhi","Sardar Patel","Shivaji","Ambedkar"], 1, 1),
 ("The Statue of Unity is in which state?", ["Gujarat","Maharashtra","Madhya Pradesh","Rajasthan"], 0, 2),
 ("How many colours are in a rainbow?", ["5","6","7","8"], 2, 1),
 ("Fastest land animal?", ["Lion","Cheetah","Horse","Leopard"], 1, 1),
 ("Hardest natural substance?", ["Gold","Iron","Diamond","Quartz"], 2, 1),
 ("Square root of 144?", ["11","12","13","14"], 1, 1),
 ("15 × 15 = ?", ["215","225","235","250"], 1, 2),
 ("How many bones does an adult human have?", ["206","208","196","212"], 0, 2),
 ("How many chambers does the human heart have?", ["2","3","4","5"], 2, 2),
 ("Plants absorb which gas?", ["Oxygen","Carbon dioxide","Nitrogen","Hydrogen"], 1, 1),
 ("Speed of light is about?", ["3 lakh km/s","30,000 km/s","3 crore km/s","3,000 km/s"], 0, 3),
 ("India's first chess grandmaster?", ["Viswanathan Anand","D Gukesh","P Harikrishna","K Sasikiran"], 0, 2),
 ("Who became world chess champion in 2024?", ["Praggnanandhaa","D Gukesh","Arjun Erigaisi","Nihal Sarin"], 1, 2),
 ("Who wrote the Panchatantra?", ["Vishnu Sharma","Kalidas","Chanakya","Tulsidas"], 0, 3),
 ("Who wrote the Arthashastra?", ["Chanakya","Kalidas","Aryabhata","Patanjali"], 0, 2),
 ("Who compiled the Yoga Sutras?", ["Patanjali","Charaka","Sushruta","Vyasa"], 0, 3),
 ("International Yoga Day is on?", ["21 June","21 March","5 June","1 May"], 0, 2),
 ("Which Mughal emperor built the Taj Mahal?", ["Akbar","Shah Jahan","Jahangir","Aurangzeb"], 1, 1),
 ("Who built the Red Fort?", ["Akbar","Shah Jahan","Humayun","Babur"], 1, 2),
 ("Founder of the Mughal Empire?", ["Babur","Akbar","Humayun","Timur"], 0, 2),
 ("Battle of Plassey was fought in?", ["1757","1764","1857","1761"], 0, 3),
 ("India's First War of Independence was in?", ["1757","1857","1905","1947"], 1, 2),
 ("The Dandi March was in?", ["1919","1930","1942","1920"], 1, 3),
 ("The Quit India Movement began in?", ["1930","1942","1945","1947"], 1, 2),
 ("Jallianwala Bagh is in?", ["Amritsar","Lahore","Ludhiana","Jalandhar"], 0, 2),
 ("'Give me blood, I will give you freedom' — who said it?", ["Bhagat Singh","Subhas Chandra Bose","Tilak","Lala Lajpat Rai"], 1, 2),
 ("'Swaraj is my birthright' — who said it?", ["Bal Gangadhar Tilak","Gandhi","Gokhale","Nehru"], 0, 3),
 ("'Kitne aadmi the?' is from?", ["Sholay","Deewar","Zanjeer","Don"], 0, 1),
 ("'Mere paas maa hai' is from?", ["Deewar","Trishul","Shakti","Sholay"], 0, 2),
 ("'Pushpa, I hate tears' is from?", ["Amar Prem","Anand","Aradhana","Kati Patang"], 0, 3),
 ("'Bade bade deshon mein aisi chhoti chhoti baatein…' is from?", ["DDLJ","Kuch Kuch Hota Hai","Dil To Pagal Hai","Kal Ho Naa Ho"], 0, 2),
 ("'All is well' is from?", ["3 Idiots","PK","Munna Bhai MBBS","Taare Zameen Par"], 0, 1),
 ("Jaadu the alien appears in?", ["Koi Mil Gaya","PK","Krrish","Ra.One"], 0, 1),
 ("Munna Bhai's sidekick?", ["Circuit","Majnu","Babu Bhaiya","Raju"], 0, 1),
 ("Who played Babu Bhaiya in Hera Pheri?", ["Paresh Rawal","Johnny Lever","Rajpal Yadav","Om Puri"], 0, 1),
 ("Andaz Apna Apna's lead pair?", ["Aamir & Salman","SRK & Salman","Aamir & SRK","Govinda & Aamir"], 0, 2),
 ("Who sang 'Tum Hi Ho'?", ["Arijit Singh","Atif Aslam","KK","Sonu Nigam"], 0, 1),
 ("Who sang the 'Kal Ho Naa Ho' title song?", ["Sonu Nigam","Udit Narayan","Shaan","KK"], 0, 2),
 ("RD Burman's nickname?", ["Pancham","Dada","Babu","Chhote"], 0, 3),
 ("Kishore Kumar's real name?", ["Abhas Kumar Ganguly","Ashok Kumar","Kishore Ganguly","Anoop Kumar"], 0, 3),
 ("Gully Boy is set in?", ["Delhi","Mumbai","Kolkata","Pune"], 1, 2),
 ("In Queen, Rani goes on her honeymoon alone to?", ["Paris & Amsterdam","London","Rome","Bali"], 0, 2),
 ("Zindagi Na Milegi Dobara's road trip is in?", ["Italy","Spain","France","Greece"], 1, 1),
 ("In Yeh Jawaani Hai Deewani, the friends trek near?", ["Manali","Ladakh","Rishikesh","Kasol"], 0, 2),
 ("In Jab We Met, Geet is from?", ["Bhatinda","Ludhiana","Amritsar","Chandigarh"], 0, 3),
]

def norm(t):
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9]+', ' ', t.lower())).strip()

def q(s):
    return "'" + s.replace("'", "''") + "'"

titles, seen = [], set()
for line in SONGS.strip().splitlines():
    for t in line.split('|'):
        t = t.strip()
        n = norm(t)
        if t and n not in seen and n[0].isalpha():
            seen.add(n); titles.append((t, n))

out = ["-- generated by make_seed.py"]
out.append("insert into public.songs(title, norm, first_letter) values\n" +
           ",\n".join(f"({q(t)},{q(n)},{q(n[0])})" for t, n in titles) + ";")
out.append("insert into public.sync_prompts(prompt, a, b) values\n" +
           ",\n".join(f"({q(p)},{q(a)},{q(b)})" for p, a, b in SYNC) + ";")
for qq, opts, ans, d in TRIVIA:
    assert len(opts) == 4 and 0 <= ans < 4
out.append("insert into public.trivia(q, options, answer, difficulty) values\n" +
           ",\n".join(f"({q(qq)},{q(json.dumps(o, ensure_ascii=False))}::jsonb,{a},{d})" for qq, o, a, d in TRIVIA) + ";")
open('03_seed.sql', 'w').write("\n\n".join(out) + "\n")

# Export songs for the client (autocomplete + local validation)
json.dump([t for t, _ in titles], open('../web/songs.json', 'w'), ensure_ascii=False)
letters = sorted({n[0] for _, n in titles})
print(len(titles), "songs;", len(SYNC), "sync;", len(TRIVIA), "trivia; letters:", "".join(letters))
