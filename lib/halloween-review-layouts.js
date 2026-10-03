/* Explicit scene-aware review layouts. Coordinates are PDF points or stage percent. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MonstersNOWHalloweenLayouts=factory();})(globalThis,function(){
  const framed = { artBox:{xPt:110,yPt:205,widthPt:410,heightPt:410},copyXPt:48,copyTopPt:191,copyWidthPt:534,bodySize:14,headingSize:19,maxBodyHeightPt:145 };
  const layouts = {
    6:framed,7:framed,8:framed,9:framed,
    21:framed,26:framed,27:framed,28:framed,29:framed,
    12:{bodySize:14,headingSize:19,maxBodyHeightPt:145},
    14:framed,
    16:{bodySize:14,headingSize:19,maxBodyHeightPt:145},
    17:framed,
    18:framed,
    22:{bodySize:14,headingSize:19,maxBodyHeightPt:140},
    23:{bodySize:14,headingSize:19,maxBodyHeightPt:150},
    24:framed,
    30:framed,
    31:framed,
  };
  // Per-scene hero sizes and clearances; no repeating placement pattern.
  const placements = {
    4:{child:{x:73,y:92.4,scale:38},monster:{x:27,y:92.4,scale:46}},
    5:{child:{x:25,y:92.4,scale:37},monster:{x:75,y:92.4,scale:44}},
    6:{child:{x:25,y:92.4,scale:35},monster:{x:70,y:92.4,scale:40}},
    7:{child:{x:74,y:92.4,scale:35},monster:{x:27,y:92.4,scale:43}},
    8:{child:{x:73,y:92.4,scale:35},monster:{x:27,y:92.4,scale:43}},
    9:{child:{x:25,y:92.4,scale:35},monster:{x:75,y:92.4,scale:42}},
    10:{child:{x:26,y:92.4,scale:35},monster:{x:74,y:92.4,scale:43}},
    11:{child:{x:73,y:92.4,scale:35},monster:{x:26,y:92.4,scale:43}},
    12:{child:{x:21,y:92.4,scale:32},monster:{x:79,y:92.4,scale:36}},
    13:{child:{x:25,y:92.4,scale:35},monster:{x:74,y:92.4,scale:43}},
    14:{child:{x:72,y:95,scale:32},monster:{x:30,y:96,scale:36}},
    15:{child:{x:74,y:92.4,scale:35},monster:{x:26,y:92.4,scale:44}},
    16:{child:{x:80,y:92.4,scale:32},monster:{x:51,y:92.4,scale:36}},
    17:{child:{x:19,y:95,scale:31},monster:{x:74,y:96,scale:40}},
    18:{child:{x:22,y:95,scale:32},monster:{x:78,y:96,scale:36}},
    19:{child:{x:73,y:92.4,scale:35},monster:{x:27,y:92.4,scale:42}},
    20:{child:{x:73,y:92.4,scale:34},monster:{x:26,y:92.4,scale:40}},
    21:{child:{x:24,y:92.4,scale:34},monster:{x:73,y:92.4,scale:40}},
    22:{child:{x:30,y:92.4,scale:32},monster:{x:78,y:92.4,scale:38}},
    23:{child:{x:54,y:92.4,scale:32},monster:{x:25,y:92.4,scale:38}},
    24:{child:{x:73,y:95,scale:32},monster:{x:26,y:96,scale:36}},
    25:{child:{x:54,y:92.4,scale:32},monster:{x:25,y:92.4,scale:38}},
    26:{child:{x:20,y:96,scale:33},monster:{x:75,y:92.4,scale:42}},
    27:{child:{x:73,y:92.4,scale:36},monster:{x:25,y:92.4,scale:44}},
    28:{child:{x:73,y:92.4,scale:36},monster:{x:26,y:92.4,scale:44}},
    29:{child:{x:19,y:96,scale:32},monster:{x:61,y:96,scale:38}},
    30:{child:{x:72,y:96,scale:34},monster:{x:27,y:96,scale:35}},
    31:{child:{x:21,y:63,scale:38},monster:{x:80,y:95,scale:35}},
  };
  const props = { 31:[{
    type:'prop', src:'/assets/props/candidates/home-two-treats-v1/two-wrapped-treats.png',
    assetId:'home-two-treats-prop-candidate-v1', assetVersion:'candidate-v1', status:'candidate',
    x:57,y:73,scale:15,anchor:{x:0.5,y:0.91015625},mirror:false,
  }] };
  const clone=value=>value?JSON.parse(JSON.stringify(value)):null;
  return { layoutForPage:number=>clone(layouts[number]), placementsForPage:number=>clone(placements[number]), propsForPage:number=>clone(props[number]) || [] };
});
