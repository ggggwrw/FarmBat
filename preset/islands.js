// preset/islands.js - Islands map preset
(function(){
    window.mapPresets = window.mapPresets || {};
    window.mapPresets.islands = {
        id: 'islands',
        title: 'Islands',
        difficulty: 'Medium',
        // islands should have fewer rivers, smaller lakes and slightly fewer forests
        riverMult: 0.12,
        lakeMult: 0.45,
        forestMult: 0.6,
        forceElevationBiomes: false,
        islandMode: true,
        biomeThresholds: {
            lake: 0.30,
            beachRounded: 0.32,
            riverMin: 0.33,
            riverMax: 0.35,
            grassMin: 0.34,
            grassMax: 0.50,
            forestMin: 0.50,
            forestMax: 0.60,
            mountainMin: 0.60,
            mountainMax: 0.70,
            snowMin: 0.70
        },
        description: 'Naval combat focused — Medium'
    };
})();
