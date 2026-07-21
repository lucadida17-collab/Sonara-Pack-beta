const distributionMap = {
   
    dark: ["dark", "melancholic", ],
    emotional: ["emotional", "calm", "melancholic"],
    epic: ["epic", "cinematic", "puissance", ],
    calm: ["calm", "emotional", "souvenir"],
    cinematic: ["cinematic", "epic",  "dramatique"],
    melancholic: ["melancholic", "calm", "dark",  ],
    classical: ["classical", "calm", "emotional"],
};

function getDistributionCategories(mainMood) {
    const mood = mainMood.toLowerCase();
    return distributionMap[mood] || [mood]
}