
(function(){
    window.mapPresets = window.mapPresets || {};
    window.mapPresets.normal = {
        id: 'normal',
        title: 'Normal',
        difficulty: 'Easy',
        riverMult: 0.28,
        lakeMult: 0.6,
        forestMult: 0.8,
        forceElevationBiomes: true,
        islandMode: false,
        biomeThresholds: {
            lake: 0.31,
            beachRounded: 0.32,
            riverMin: 0.33,
            riverMax: 0.35,
            grassMin: 0.35,
            grassMax: 0.50,
            forestMin: 0.50,
            forestMax: 0.60,
            mountainMin: 0.60,
            mountainMax: 0.70,
            snowMin: 0.70
        },
        description: 'Normal gameplay like Civ6 — Easy'
    };
})();
