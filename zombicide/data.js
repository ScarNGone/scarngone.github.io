/* Carnet de survie Zombicide : survivants de la boîte de base (2e édition), compétences connues et équipement.
   Seules les compétences vérifiées sont renseignées ; les autres se recopient depuis le tableau de bord pendant la partie. */
window.ZDATA = {
  characters: [
    {id:"amy", name:"Amy", kid:false, blue:"+1 Action de Déplacement gratuite", orange:[], red:[]},
    {id:"doug", name:"Doug", kid:false, blue:"Les deux font la paire", orange:[], red:[]},
    {id:"elle", name:"Elle", kid:false, blue:"", orange:[], red:[]},
    {id:"josh", name:"Josh", kid:false, blue:"", orange:[], red:[]},
    {id:"ned", name:"Ned", kid:false, blue:"+1 Action de Fouille gratuite", orange:[], red:[]},
    {id:"wanda", name:"Wanda", kid:false, blue:"", orange:[], red:[]},
    {id:"ostara", name:"Ostara", kid:true, blue:"", orange:[], red:[]},
    {id:"lili", name:"Lili", kid:true, blue:"", orange:[], red:[]},
    {id:"tigersam", name:"Tiger Sam", kid:true, blue:"", orange:[], red:[]},
    {id:"odin", name:"Odin", kid:true, blue:"+1 dé : Mêlée", orange:[], red:[]},
    {id:"bunnyg", name:"Bunny G", kid:true, blue:"", orange:[], red:[]},
    {id:"lou", name:"Lou", kid:true, blue:"", orange:[], red:[]}
  ],
  skills: {
    "+1 Action": {desc:"Une quatrième action à chaque tour dès le niveau jaune.", extraAction:false},
    "+1 Action de Déplacement gratuite": {desc:"Une fois par tour, un déplacement qui ne compte pas dans tes actions.", free:"move"},
    "+1 Action de Fouille gratuite": {desc:"Une fouille par tour sans dépenser d'action. Tu ne fouilles toujours qu'une fois par tour.", free:"search"},
    "+1 Action de Combat gratuite": {desc:"Une attaque par tour, au corps à corps ou à distance, sans dépenser d'action.", free:"combat"},
    "+1 Action de Mêlée gratuite": {desc:"Une attaque au corps à corps par tour sans dépenser d'action.", free:"melee"},
    "+1 Action à distance gratuite": {desc:"Un tir par tour sans dépenser d'action.", free:"ranged"},
    "Les deux font la paire": {desc:"Quand tu pioches en fouille une arme à symbole double, prends aussitôt le deuxième exemplaire dans la pioche."},
    "+1 dé : Mêlée": {desc:"Chaque arme de corps à corps lance un dé de plus (deux de plus pour une paire d'armes doubles)."},
    "Insaisissable": {desc:"Tu ignores les zombies quand tu te déplaces : pas d'action en plus pour quitter leur zone. Entrer dans une zone avec des zombies arrête ton déplacement."}
  },
  startingGear: "Distribue au hasard les 6 cartes d'équipement de départ (1 batte de baseball, 1 pied-de-biche, 1 hache d'incendie, 3 pistolets), le plus équitablement possible. Dans la règle officielle, le survivant qui reçoit la hache d'incendie commence le premier tour.",
  equipment: [
    {group:"Armes de corps à corps", items:[
      {name:"Batte de baseball", melee:true},
      {name:"Pied-de-biche", melee:true, door:true},
      {name:"Hache d'incendie", melee:true, door:true},
      {name:"Machette", melee:true},
      {name:"Katana", melee:true},
      {name:"Kukri", melee:true},
      {name:"Poêle", melee:true},
      {name:"Tronçonneuse", melee:true, door:true}
    ]},
    {group:"Armes à distance", items:[
      {name:"Pistolet", ranged:true},
      {name:"Fusil à canon scié", ranged:true},
      {name:"Fusil à pompe", ranged:true},
      {name:"Fusil de précision", ranged:true},
      {name:"Pistolet-mitrailleur", ranged:true},
      {name:"Cocktail Molotov", ranged:true, molotov:true}
    ]},
    {group:"Équipement et vivres", items:[
      {name:"Lampe torche"},
      {name:"Munitions (balles)"},
      {name:"Munitions (cartouches)"},
      {name:"Bouteille d'eau"},
      {name:"Boîte de conserve"},
      {name:"Sac de riz"}
    ]}
  ],
  doorTools: ["pied-de-biche", "pied de biche", "hache", "tronçonneuse", "tronconneuse"]
};
