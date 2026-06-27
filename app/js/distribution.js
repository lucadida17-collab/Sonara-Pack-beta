const distributionMap = {
   
    dark: ["dark", "sombre", "souvenir"],
    emotional: ["emotional", "calm", "melancholic"],
    epic: ["epic", "cinematic", "puissance", "dramatique"],
    calm: ["calm", "emotional", "souvenir"],
    cinematic: ["cinematic", "epic",  "dramatique"],
    melancholic: ["melancholic", "calm", "dark", "sombre" ]
};

function getDistributionCategories(mainMood) {
    const mood = mainMood.toLowerCase();
    return distributionMap[mood] || [mood]
}