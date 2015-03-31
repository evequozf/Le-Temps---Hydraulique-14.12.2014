(function() { 

/************ variables globales *******************/

//définit l'ordre de classement !
var partis = [
	"PDC",
	"PLR",
	"PS",
	"UDC",
	"sans parti",
	"GDIP",
	"AC",
	"MCI",
	"parti indépendant",
	"autre",
	"Entente",
	"FCD",
	"",
	"#N/A"
];
 
function isAutre(parti) {
	return partis.indexOf(parti)>3 && partis.indexOf(parti)<12;
}

//hack -> Hydro Exploitation should be last
function isForcedLast(entreprise) {
	return entreprise == "HYDRO Exploitation (entreprise d'exploitation)";
}


//polygones/paths à dessiner en fonction du niveau fédéral, cantonal, ancien
var polyPointsFed = "43,15 28,15 28,0 15,0 15,15 0,15 0,28 15,28 15,43 28,43 28,28 43,28 ",
  polyPointsCant = "22.184,0.342 29.069,14.328 44.466,16.572 33.325,27.459 35.955,42.833 22.184,35.573 8.413,42.833 11.042,27.459 -0.099,16.572 15.298,14.328";
  polyPointsOld = "23.088,2.834 42.25,39.999 3.923,39.999 ",
  polyPointsNot = "22,0 44,22 22,44 0,22";
var pathComm = "M3.356,1.396H3.213v15.839c0,17.488,18.287,24.368,18.287,24.368s18.287-6.88,18.287-24.368c0-13.363,0-15.55,0-15.839h-0.144H3.356z";
var SHAPE_WIDTH = 44; //given by size of elements
var ww = SHAPE_WIDTH; //width (given by the swiss cross size & valais star)
var padding = 5; //size of padding around shape (at ww's scale ! will be rescaled)
//var circlescale = 0.435; //radius of circles is circlescale*ww (at ww's scale)
var rectscale = 0.83333333; //width and height of squares is rectscale*ww (at ww's scale)

var selectedparticolor;

/************** tooltip *****************/

var ttip = d3.select("body").append("div")   
    .attr("class", "tooltip")               
    .style("opacity", 0);

/*************************** MAIN *****************************/

/*
queue()
	.defer(loadData)
	.await(update);
*/

//indexed by entreprise (unit chart)
var fulldata = new Array();

//indexed by persons (pyramid)
var persondata = {};
var personarray = new Array();

function loadData() {
	
	d3.csv("data.csv", function(error, ddata) {
	  //note : data.csv needs to be sorted by entreprise
  
	  var currentEntr = '';
	  var countElus = 0;
	  var countElusPDC = 0;
    
	  ddata.forEach(function(d) {
		  //if new company, create
		  if(d.company!=currentEntr) {
			  //insert count in previous company and reset
			  if(fulldata.length>0) {
				  fulldata[fulldata.length-1].nbElus = countElus;
				  fulldata[fulldata.length-1].nbElusPDC = countElusPDC;
				  countElus = 0;   
				  countElusPDC = 0; 
			  }
			  //insert new company
			  fulldata.push({
				  entreprise:d.company,
				  isdistr:+d.Entr_distributrice,
				  ca:new Array(),
				  nbElus:0,
				  nbElusPDC:0
			  });
			  currentEntr = d.company;
		  }
		  //in any case, insert a new ca member in last object (current)
		  fulldata[fulldata.length-1].ca.push({
			  personid:"p"+d.PersonId,
			  entr:currentEntr,
			  name: d.nameComplete,
			  parti:d.Parti,
			  inserteddate: d.InsertedDate,
			  fonction:d.Function,
			  commune:d.Commune,
			  level:(d.Level=="#N/A"?10:d.Level)
		  });
		  if(d.Parti=="PDC") countElusPDC++;
		  if(d.Parti!="#N/A") countElus++;
		  
		  //handle persons -> also insert the person in persondata if needed
		  if(d.Parti!="#N/A") {
			  if((typeof persondata["p"+d.PersonId]) == 'undefined') {
				persondata["p"+d.PersonId] = {
						name: d.nameComplete,
						parti:d.Parti,
						fonction:d.Function,
						commune:d.Commune,
						level:d.Level,
						codepol:d.codePol,
						sieges: []
					};
				personarray.push("p"+d.PersonId);
			  } 
			  persondata["p"+d.PersonId].sieges.push({
								entr: currentEntr, 
								inserteddate: d.InsertedDate,
								fonctionEntr: d.functionEntr, 
								auth: d.authorisation,
								fonction: d.Function,
								commune: d.Commune,
								isdistr: +d.Entr_distributrice
			  });
			}
		  //end handling persons
	  });
	  //insert count elus in last company
	  fulldata[fulldata.length-1].nbElus = countElus;
	  fulldata[fulldata.length-1].nbElusPDC = countElusPDC;
  
  
	//classer les membres du CA, d'abord le plus haut niveau de la pyramide
	//et ensuite dans l'ordre des partis
	  fulldata.forEach(function(element,index,array) {
		element.ca.sort(function (a,b) {
			if(partis.indexOf(a.parti) > partis.indexOf(b.parti)) {
				return partis.indexOf(b.parti) == -1 ? -1 : 1;
			}
			if(partis.indexOf(a.parti) < partis.indexOf(b.parti)) {
				return partis.indexOf(a.parti) == -1 ? 1 : -1;
			}
			//si même parti: par niveau
			var l1 = +a.level;
			var	l2 = +b.level;
			if (l1 > l2) {
				return 1;
			}
			if (l1 < l2) {
				return -1;
			}
			return 0;
		});
	  });  
	  
	  
	  //data loaded -> create charts FIXME: queue ?
	  updateUnitCharts();
	  buildPyramid();
	  
	  //Pym specifics -> call redraw on parent
	  pymChild.sendHeight();
	  //end Pym specifics
	  
	  //FIXME hack force redraw to avoid safari glitches
	  hackForceRedrawSafari();
	  
	}); //end d3.csv
}

/************ update and redraw **************/

function updateUnitCharts() {

	//window.alert("Entering redraw with fulldata size = "+fulldata.length);
	//var fulldata = gdata;

	/********* Filtering happens here ****************/
	var data = new Array();

	data = fulldata.filter(function(element) {
		//return true;  //toutes les entreprises
		return element.nbElus>0; //seul. entreprises avec des élus au CA
	});

	data.sort(function (a,b) {
		//FIXME : hack Hydro exploitation en dernier
		if(isForcedLast(a.entreprise)) {
			return 1;
		} else if (isForcedLast(b.entreprise)) {
			return -1;
		}
		//normal
		if (a.nbElus > b.nbElus) {
			return -1;
		}
		if (a.nbElus < b.nbElus) {
			return 1;
		};
		if (a.nbElusPDC > b.nbElusPDC) {
			return -1;
		};
		if (a.nbElusPDC < b.nbElusPDC) {
			return 1;
		}
	});

	/*
  fulldata.forEach(function(element,index,array){

  });
	 */
	//data = fulldata;

	/////////// domains //////////// TODO : requires data load and may change on update
	var maxCa = 0;
	var maxElus = 0;
	data.forEach(function (e,i,a){
		maxCa = Math.max(maxCa,e.ca.length);
		maxElus = Math.max(maxElus,e.nbElus);
	});
	//maxCa = 20;
	
	/************ Separate producteurs from distributeurs **************/
	
	var distrData = data.filter(function(element) {
		return element.isdistr>0; //seul. entreprises où isdistr > 0
	});
	var prodData = data.filter(function(element) {
		return element.isdistr==0; //seul. entreprises où isdistr == 0
	});

	/************ Init unit charts: creates svg, scales, axis **************/
	
	//doubles the variables when needed -> 2 charts will be created. 
	//E.g. x[0] will contain scale of first chart, svg[1] contains d3 svg element of second chart
	var x = new Array(2),
		y = new Array(2),
		xAxis = new Array(2),
		yAxis = new Array(2),
		svg = new Array(2),
		svgHeight = [distrData.length*16,prodData.length*15.5];
		
	initUnitCharts("#unit-chart-container-2",0);
	initUnitCharts("#unit-chart-container-1",1);
	
	function initUnitCharts(container, idx) {
		
		var margin = {top: 0, right: 270, bottom: 0, left: 0},
			width = 420 - margin.left - margin.right ,
			height = svgHeight[idx] - margin.top - margin.bottom;
				
		x[idx] = d3.scale.linear()
					.rangeRound([width, 0]); //inversé !	
		y[idx] = d3.scale.ordinal()
					.rangeRoundBands([0, height], .1);
					
		xAxis[idx] = d3.svg.axis()
					.scale(x[idx])
					.orient("top")
					.tickValues([5,10/*,15,20,25*/]); ////FIXME !
		
		yAxis[idx] = d3.svg.axis()
						.scale(y[idx])
						.orient("right");	
		
		svg[idx] = d3.select(container).append("svg")
			.attr("width", width + margin.left + margin.right)
			.attr("height", height + margin.top + margin.bottom)
			.append("g")
			.attr("transform", "translate(" + margin.left + "," + margin.top + ")");
			
		svg[idx].append("g")
			 .attr("class", "x axis");
			 
		svg[idx].append("g")
			 .attr("class", "y axis")
			 .attr("transform", "translate("+ width + ",0)"); //to put on right;
		
	}

	/************** Update functions for unit charts -> create axis labels names and data points ****************/
	
	updateUnitChart(distrData,"#unit-chart-container-2",0);
	updateUnitChart(prodData,"#unit-chart-container-1",1);
	
	function updateUnitChart(data,container,idx) {
		
		/***************** Set axis domains *******************/
		x[idx].domain([0,maxElus]);
		//x.domain([0, maxCa]);
		y[idx].domain(data.map(function(d) { return d.entreprise; }));

		//draw axis
		//d3.select(container).select(".x.axis").call(xAxis[idx]); //do not draw x axis
		d3.select(container).select(".y.axis").call(yAxis[idx]);
		
		/************** Set standard dimension of shape, based on SVG cross and star polygons ****************/
		var scalefactor = 0.8 * (
				Math.min(
						(x[idx](1)-x[idx](0))/(ww+2*padding), 	// = width of a unit in the x range, divided by ww + padding
						y[idx].rangeBand()/(ww+2*padding)	// = height of a row in the y range, divided by ww + padding
				)); 
		
		/***************** Create data points *******************/
		// créer chaque "ligne" pour une entreprise, et y mettre les labels
		entreprises = svg[idx].selectAll(".entreprise")
			.data(data, function(d) {return d.entreprise;})
			.enter().append("g")
				.attr("class", "entreprise")
				.attr("transform", function(d) { 
					return "translate(0," 
					+ (y[idx](d.entreprise)+(y[idx].rangeBand()-ww*scalefactor)/2) // center shape on enterprise name
					+")";
				})
				// dessiner le "grid"
				.each(function(d) {
					for(var i=0; i<maxElus; i++) {
						radius = 0.7;
						d3.select(this)
							.append("circle")
							.attr("cx",x[idx](i+1)-radius-ww*scalefactor/2)
							.attr("cy",radius-y[idx].rangeBand()/2)
							.attr("r",radius)
							.attr("class","grid");
					}
				});
	
		// créer le contenu de chaque ligne : les shapes du unit chart
		shapes = entreprises.selectAll(".siege")
			.data(function(d) {return d.ca;}, function(d) {return d.name+d.entr;})
			//g, placed and sized correctly
			.enter().append("g")
				.attr("class",function(d) {return "parti " + getCSSParti(d.parti) + " siege";})
				.attr("personid",function(d) {return d.personid;})
				//the actual sizing and positioning of the item is done in this transform, based on ww (width of raw shapes)
				.attr("transform", function(d,i) { 
					return "translate("+ (x[idx](i+1)-ww*scalefactor) +",0) scale("+scalefactor+")";
				})
				.on("mouseover", isTouchOnlyDevice() ? null : overshape)
				.on("mouseout", outshape)
				.on("click", selectPerson)
				//different actual shapes according to the federal level
				.each(function (d,i) {
					var item;
					//federal level = swiss cross
					if(d.level=="0") {
						item = d3.select(this).append("polygon")
						.attr("points",polyPointsFed);
					} else if(d.level=="1") {
						//cantonal level = star
						item = d3.select(this).append("polygon")
						.attr("points",polyPointsCant);
					} else if(d.level=="2") {
						//ancien = triangle
						item = d3.select(this).append("polygon")
						.attr("points",polyPointsOld);
					} else if(d.level=="3"){
						//commune = shield
						item = d3.select(this).append("path")
						.attr("d",pathComm);
					} else {
						//non élu = diamond	
						//FIXME : just for test: pas les non-élus !!
						/*
							item = d3.select(this).append("polygon")
									.attr("points",polyPointsNot)
						 */
						if(x.domain()[1]==maxCa) {
							item = d3.select(this).append("rect")
							.attr("x",(1-rectscale)*ww/2)
							.attr("y",(1-rectscale)*ww/2)
							.attr("width",rectscale*ww)
							.attr("height",rectscale*ww);
						}
					}
	
			// mirror shape along y axis to display it in good orientation
			// cause: svg axis is by default oriented towards bottom, so needs cheating on y axis range
			// which actually mirrors all the shapes -> mirror them back
			if (typeof item != 'undefined')
				item.attr("transform","translate(0,"+ww+") scale(1,-1)");
		});
	}

	
}

/**************************** PYRAMIDE *****************************/

function buildPyramid() {
	
	/*------ Icônes en regard des labels ------*/
	var iconsize=11;
	d3.selectAll(".py-info-icon")
		.append("svg")
		.attr("width",iconsize+"px")
		.attr("height",iconsize+"px")
		.append("g")
		.attr("transform", "scale("+(iconsize/ww)+")")
		.attr("id",function(d,i){return "py-icon-level"+i;});
	d3.select("#py-icon-level0")
		.append("polygon")
		.attr("points",polyPointsFed);
	d3.select("#py-icon-level1")
		.append("polygon")
		.attr("points",polyPointsCant);
	d3.select("#py-icon-level2")	
		.append("polygon")
		.attr("points",polyPointsOld);
	d3.select("#py-icon-level3")
		.append("path")
		.attr("d",pathComm);

	/*------ Personnes / layout ------*/
	d3.selectAll(".py-level-container")
		.append("div")
		.attr("class","py-personnes-container")
		.attr("level",function(d,i) {return "l"+i;});

	//	Builds the pyramid, shape is an array of arrays of values to build the pyramid
	function buildPyramid(shape) {
		for(var i=0; i<shape.length; i++) {
			for(var j=0; j<shape[i].length; j++) {
				d3.select("[level=l"+i+"]")
					.append("div")
					.attr("class","py-personnes-layer-"+j);	
				for(var k=0; k<shape[i][j]; k++) {
					size = i==3 ? 7 : 23; 				//FIXME: hardcode ???
					s = d3.select("[level=l"+i+"]")
						.select(".py-personnes-layer-"+j)
						.append("div")
						.attr("class","py-personne")
							.append("svg")
							.attr("width",size*2)
							.attr("height",size*2)
								.append("circle")
								.attr("cx",size)
								.attr("cy",size)
								.attr("r",i==3 ? 4 : size-6)
								.attr("class", i==3 ? "small" : null);
				}	
			}
		}
	}
	buildPyramid([  //forme de la pyramide: combien de personnes sur quel niveau / à défaut de responsive
	                //level 0 : fédéral
	                [4, 0, 0],  //4
	                //level 1 : cantonal
	                [8, 0, 0], 
	                //[5, 2, 1],  //8
	                //level 2 : anciens
	                [5, 0, 0],  //5
	                //level 3 : communal 
	                //[18,18,18,19]  //75
	                [25,25,24] //75
	                //[19,18,15,7,1,15]
	                ]);


	/*------ Link shapes with data and photos ------*/
	// sort person array -> criteria 1.level 2.parti 3.alphabetical order name (inverse)
	personarray.sort(function (a,b) {
		//par niveau
		var l1 = +persondata[a].level;
		var	l2 = +persondata[b].level;
		if (l1 > l2) {
			return 1;
		}
		if (l1 < l2) {
			return -1;
		}
		//si même niveau, par parti (ordre inverse PDC en dernier)
		// -> si les deux sont d'un "autre" parti -> alphabétique
		if (!(isAutre(persondata[a].parti) && isAutre(persondata[b].parti))) {
			var p1 = partis.indexOf(persondata[a].parti);
			var p2 = partis.indexOf(persondata[b].parti);
			if(p1 < p2) {
				return 1;
			}
			if(p1 > p2) {
				return -1;
			}
		}
		//sinon, par ordre alphabétique
		var n1 = persondata[a].name;
		var n2 = persondata[b].name;
		if(n1 > n2) {
			return 1;
		}
		if(n1 < n2) {
			return -1;
		}
	});

	// associate persons with circles
	d3.selectAll(".py-personne circle") //FIXME -> modèle pas terrible : le div ou l'intérieur ?
		.data(personarray)
		.attr("title",function(d) {return persondata[d].name;})
		.attr("personid",function(d) {return d;})
		.attr("class",function(d) {return (
				persondata[d].level == 3 ? 
						"small " 
						: "") + "parti " + getCSSParti(persondata[d].parti);})
						.on("mouseover", isTouchOnlyDevice() ? null : overshape) 
						.on("mouseout", outshape)
						.on("click", selectPerson);

	// insert photos (notice selector, because small circles of level=l3 don't have a photo)
	d3.selectAll(".py-personnes-container:not([level=l3]) .py-personne svg") 
		.data(personarray)
		.insert("image","circle") 
			.attr("xlink:href",function(d) {
				return "./assets/"
				+ removeDiacritics(persondata[d].name)
				+ ".jpg"; 
			}) 
			.attr("x","4")
			.attr("y","2")
			.attr("width","40")
			.attr("height","40")
			.attr("clip-path","url(#clip-path-small)");

} //end buildPyramid

/****************** Update info zone ********************/
function updateInfo(personId) {
	
	// display info zone
	d3.select("#info-personne").style("display",null);
	d3.select("#info-personne")
		.style("opacity",0)
		.transition()
			.duration(700)
			.style("opacity",1)
			.each("end", function() {
				d3.select(this).style("opacity",null);
			});
	d3.select("#info-instructions").style("display","none");
	
	//display return to overview button
	d3.select("#return-to-overview").style("display", null);
	d3.select("#return-to-overview")
		.style("opacity",0)
		.transition()
			.duration(700)
			.delay(700)
			.style("opacity",1)
			.each("end", function() {
				d3.select(this).style("opacity",null);
			});
	
	
	//set image in bigportrait
	d3.select("#bigportrait image").remove();
	portrait = d3.select("#bigportrait")
		.attr("title",persondata[personId].name);
	portrait.select("circle")
		.attr("class","selected parti "
				+getCSSParti(persondata[personId].parti));
	if(persondata[personId].level!=3) {
		portrait.insert("image","circle") 
			.attr("xlink:href","./assets/"
					+ removeDiacritics(persondata[personId].name)
					+ ".jpg") 
			.attr("x","0")
			.attr("y","0")
			.attr("width","150")
			.attr("height","150")
			.attr("clip-path","url(#clip-path-big)");
	}
	
	//set text
	d3.select("#info-name")
		.html(persondata[personId].name);
	d3.select("#info-fonction")
		.html(persondata[personId].fonction);
	d3.select("#info-parti")
		.attr("class", "parti "+getCSSParti(persondata[personId].parti))
		.html(persondata[personId].parti);
	d3.select("#info-entreprises thead")
		.attr("class","parti "+getCSSParti(persondata[personId].parti));
	
	//entreprises
	d3.selectAll("#info-entreprises tbody tr").remove();
	d3.select("#info-entreprises tbody")
		.selectAll("tr")
			.data(persondata[personId].sieges)
			.enter().append("tr")
				.each(function(d,i) {
					d3.select(this)
						.append("td")
						.html(d.entr);
					d3.select(this)
						.append("td")
						.html((new Date(d.inserteddate)).getFullYear());
					d3.select(this)
						.append("td")
						.html((typeof d.fonctionEntr == "undefined") 
								|| (d.fonctionEntr == "-") ? 
								"non précisé" :
								d.fonctionEntr);
					d3.select(this)
						.append("td")
						.html(typeof d.auth == "undefined" ? 
								"non précisé" : 
								d.auth);
				});
	
	//icon in info
	d3.select("#info-icon").selectAll("*").remove();
	d3.select("#info-icon")
		.append("g")
		.attr("transform","translate(2,2) scale("+((40-6)/SHAPE_WIDTH)+")") //FIXME de-hardcode creation of shapes + size of shape ?...
		.each(function (d,i) {
			var item;
			var level=persondata[personId].level;
			//federal level = swiss cross
			if(level=="0") {
				item = d3.select(this).append("polygon")
					.attr("points",polyPointsFed);
			} else if(level=="1") {
			//cantonal level = star
				item = d3.select(this).append("polygon")
						.attr("points",polyPointsCant);
			} else if(level=="2") {
			//ancien = triangle
				item = d3.select(this).append("polygon")
						.attr("points",polyPointsOld);
			} else if(level=="3"){
			//commune = shield
				item = d3.select(this).append("path")
						.attr("d",pathComm);
			}
			if(typeof item != undefined)
				item.attr("class","high parti "+getCSSParti(persondata[personId].parti));
				item.style("stroke","inherit"); // FIXME bourrin
			});

}

function resetInfo() {
	d3.selectAll(".info").style("display", "none");
	d3.select("#return-to-overview").style("display", "none");
	d3.select("#info-instructions").style("display",null);
	d3.select("#info-instructions")
		.style("opacity",0)
		.transition()
			.duration(700)
			.style("opacity",1)
			.each("end", function() {
				d3.select(this).style("opacity",null);
			});
}

/****************** Interaction ********************/

//FIXME: problem de redraw dans Safari ! si on resize c'est bon ! trouver pourquoi ou que faire pour changer !

//var count=0; //DEBUG
function overshape(d) {

	/////DEBUG
	//if(count<2) { 
//		document.getElementById('#graphs-container').style.display='none';
//		document.getElementById('#graphs-container').offsetHeight; // no need to store this anywhere, the reference is enough
//		document.getElementById('#graphs-container').style.display='block';
//		var c = document.getElementsByName("viewport")[0].getAttribute("content");
//		document.getElementsByName("viewport")[0].setAttribute("content", "width=10");
//		document.getElementsByName("viewport")[0].setAttribute("content", c);
//		d3.select("body").style("display","none");
//		d3.select("body").style("display",null);
//		
//		//count++;
	//}//////
	
	var personid = this.getAttribute("personid");
	
	var sel;
	if(personid != "p") { // personid = p pour ceux qui n'en ont pas...
		sel = d3.selectAll("[personid="+personid+"]");
	} else { //pas élu-> seulement ce point //TODO->montrer cumuls ? si oui personid p0.qqch à ajouter pour les non-élus
		sel = d3.select(this);
	}
	sel.classed("high",true).classed("hover",true); 

	// tooltip
	ttip.select("a").remove();
	ttip
		.style("left", (d3.event.pageX - 40) + "px")     
		.style("top", (d3.event.pageY + (d3.event.pageY < 100 ? 20 : - 75)) + "px")
		/*.append("a")
			.attr("href","#top")*/
			.html("<div>"+persondata[personid].name+"</div>"
					+"<div class=\"clic\">Cliquez pour détails</div>"
					/*+d.fonction+"<br/>"
				+d.commune+"<br/>"+d.parti*/);
	ttip.transition()        
		.duration(100)      
		.style("opacity", 1);  
	
	//highlight corresponding axes in unit chart
	d3.selectAll(".y.axis .tick text")
		.each(function(dd) {
			if (personid=="p") return;
			//scan through all entreprises
			for(var i=0; i<persondata[personid].sieges.length; i++) {
				t=d3.select(this);	
				if(t.datum()==persondata[personid].sieges[i].entr)
					t.classed("high",true);
			}
		});
	
	// and highlight title of unit chart if relevant
	var flag_distr = false;
	var flag_prod = false;
	for(var i=0; i<persondata[personid].sieges.length; i++) {
		flag_distr = flag_distr || (persondata[personid].sieges[i].isdistr == 1);
		flag_prod = flag_prod || (persondata[personid].sieges[i].isdistr == 0);
	}
	d3.select("#unit-chart-container-1 .unit-chart-title")
		.classed("high",flag_prod);
	d3.select("#unit-chart-container-2 .unit-chart-title")
		.classed("high",flag_distr);
	
	//highlight corresponding political function
	sel = d3.select("#py-level"+persondata[personid].level);
	sel.select(".py-info-level-title")
		.classed("high",true);
	/*sel.select(".py-info-icon")
		.classed("high",true);*/
	sel.selectAll("[codepol=c"+persondata[personid].codepol+"]")
		.classed("high",true);
}

function outshape(d) {
	
	// points in unit charts and pyramid
	d3.selectAll("[personid="+this.getAttribute("personid")+"]")
		.classed("high",false)
		.classed("hover",false);
	
	//tooltip
	ttip.transition()        
		.duration(200)      
		.style("opacity", 0);
	
	//de-highlight corresponding axes
	d3.selectAll(".y.axis .tick text")
		.each(function(dd) {
			d3.select(this).classed("high",false);
		});
	
	//de-highlight unit chart titles
	d3.selectAll(".unit-chart-title")
		.classed("high",false);
	
	//de-highlight corresponding political function
	d3.selectAll(".py-info-level-title")
		.classed("high",false);
	d3.selectAll(".py-info-icon")
		.classed("high",false);
	d3.selectAll(".py-info-level-content")
		.classed("high",false);
}



function selectPerson(d) {
	
	outclick(d); //deselects the previously selected first
	
	//hide tooltip (for mobile especially) -> fonctionne pas
	//ttip.style("opacity", 0);
	
	var personid = this.getAttribute("personid");
	var parti = getCSSParti(persondata[personid].parti);

	//set info zone
	updateInfo(personid);
	
	//highlight enterprises shapes in unit chart and portrait in pyramid
	d3.selectAll("[personid="+personid+"]")
		.classed("selected",true); 
	
	//highlight selected parti, lower others
	d3.selectAll(".parti")
		.classed("low",true);
	//d3.selectAll("."+parti)
	//	.classed("low",false);
	d3.selectAll(".legende ."+parti)
		.classed("low", false)
		.classed("selected",true);
	
	//get color of highlighted parti (hack)
	/*var color=window.getComputedStyle(
			d3.select("#bigportrait circle.selected").node())
		.getPropertyValue('stroke');*/
	
	// highlight title of unit chart if relevant
	var flag_distr = false;
	var flag_prod = false;
	for(var i=0; i<persondata[personid].sieges.length; i++) {
		flag_distr = flag_distr || (persondata[personid].sieges[i].isdistr == 1);
		flag_prod = flag_prod || (persondata[personid].sieges[i].isdistr == 0);
	}
	d3.select("#unit-chart-container-1 .unit-chart-title")
		.classed("selected",flag_prod);
	d3.select("#unit-chart-container-2 .unit-chart-title")
		.classed("selected",flag_distr);
	
	//highlight corresponding axes in unit-chart
	d3.selectAll(".y.axis .tick text")
		.each(function(dd) {
			if (personid=="p") return;
			//scan through all entreprises
			for(var i=0; i<persondata[personid].sieges.length; i++) {
				t=d3.select(this);	
				if(t.datum()==persondata[personid].sieges[i].entr) 
					t.classed("selected",true)
						/*.style("fill",color)*/;
			}
		});
	
	//highlight corresponding axes in pyramid
	sel = d3.select("#py-level"+persondata[personid].level);
	sel.select(".py-info-level-title")
		.classed("selected",true)
		/*.style("color",color)*/;
	sel.select(".py-info-icon")
		.classed("selected",true)
		/*.style("fill",color)*/;
	sel.selectAll("[codepol=c"+persondata[personid].codepol+"]")
		.classed("selected",true)
		/*.style("color",color)*/;
	
	//stop event from propagating upwards in DOM tree
	d3.event.stopPropagation();
	
	//if touch only -> scroll to top
	if (isTouchOnlyDevice()) {
		//location.href = '#top';
		/*var target = document.getElementById("top");
	    slideToAnchor(document.body, "scrollTop", "", 
	    		getOffset(d3.select(this).node()).top, target.offsetTop, 
	    		1000, true);
	    */
		document.getElementById('top').scrollIntoView(true);
	}
	
	//PYM specifics
	pymChild.sendHeight();
	//PYM specifics
}

//selects a parti
function selectParti(d) {
		
	outclick(d); //deselects the previously selected first
	
	var parti = this.getAttribute("parti");
	
	//set info zone : FIXME : copy-pasted...
	// display info zone
	d3.select("#info-parti-"+parti)
		.style("display",null)
		.style("opacity",0)
		.transition()
			.duration(700)
			.style("opacity",1)
			.each("end", function() {
				d3.select(this).style("opacity",null);
			});
	d3.select("#info-instructions").style("display","none");
	
	//display return to overview button
	d3.select("#return-to-overview").style("display", null);
	d3.select("#return-to-overview")
		.style("opacity",0)
		.transition()
			.duration(700)
			.delay(700)
			.style("opacity",1)
			.each("end", function() {
				d3.select(this).style("opacity",null);
			});
	
//	//highlight enterprises shapes in unit chart and portrait in pyramid
//	d3.selectAll("[personid="+personid+"]")
//		.classed("selected",true); 
//	
	//highlight selected parti, lower others
	d3.selectAll(".parti")
		.classed("low",true);
	d3.selectAll("."+parti)
		.classed("low",false);
	d3.selectAll(".legende ."+parti)
		.classed("low", false)
		.classed("selected",true);
	
	//get color of highlighted parti (hack)
	/*var color=window.getComputedStyle(
			d3.select("#bigportrait circle.selected").node())
		.getPropertyValue('stroke');*/
	
//	// highlight title of unit chart if relevant
//	var flag_distr = false;
//	var flag_prod = false;
//	for(var i=0; i<persondata[personid].sieges.length; i++) {
//		flag_distr = flag_distr || (persondata[personid].sieges[i].isdistr == 1);
//		flag_prod = flag_prod || (persondata[personid].sieges[i].isdistr == 0);
//	}
//	d3.select("#unit-chart-container-1 .unit-chart-title")
//		.classed("selected",flag_prod);
//	d3.select("#unit-chart-container-2 .unit-chart-title")
//		.classed("selected",flag_distr);
//	
	//highlight corresponding axes in unit-chart
//	d3.selectAll(".y.axis .tick text")
//		.each(function(dd) {
//			if (personid=="p") return;
//			//scan through all entreprises
//			for(var i=0; i<persondata[personid].sieges.length; i++) {
//				t=d3.select(this);	
//				if(t.datum()==persondata[personid].sieges[i].entr) 
//					t.classed("selected",true)
//						/*.style("fill",color)*/;
//			}
//		});
//
//	//highlight corresponding axes in pyramid
//	sel = d3.select("#py-level"+persondata[personid].level);
//	sel.select(".py-info-level-title")
//		.classed("selected",true)
//		/*.style("color",color)*/;
//	sel.select(".py-info-icon")
//		.classed("selected",true)
//		/*.style("fill",color)*/;
//	sel.selectAll("[codepol=c"+persondata[personid].codepol+"]")
//		.classed("selected",true)
//		/*.style("color",color)*/;
	
	//stop event from propagating upwards in DOM tree
	d3.event.stopPropagation();
	
	//if touch only -> scroll to top
	if (isTouchOnlyDevice()) {
		document.getElementById('top').scrollIntoView(true);
	}
	
	//PYM specifics
	pymChild.sendHeight();
	//PYM specifics
	
}

//deselects current stuff
function outclick(d) {
	
	d3.selectAll(".parti")
		.classed("low",false);
	//de-colorize axes labels marked as selected
	/*
	d3.selectAll(".py-info-container .selected")
		.style("color",null)
		.style("fill",null);
	d3.selectAll(".y.axis .tick text.selected")
		.style("fill",null);
	*/
	//de-highlight enterprises shapes marked as selected
	d3.selectAll(".selected")
		.classed("selected",false); 
	resetInfo();
}
	
	
/*// clickable axis
d3.select('.x.axis')
 .selectAll('.tick')
 .on('click',clickMe)

function clickMe(d){alert(d)}
 */

 
 //////////////////////////////
 function getCSSParti(parti) {
	if((parti=="PDC") || (parti=="PLR") || (parti=="PS") || (parti=="UDC"))
			return parti;
	else return "autre";
 }
 
////////////////////////////////////////////////
/*
function clone_d3_selection(selection, i) {
            // Assume the selection contains only one object, or just work
            // on the first object. 'i' is an index to add to the id of the
            // newly cloned DOM element.
    var attr = selection.node().attributes;
    var length = attr.length;
    var node_name = selection.property("nodeName");
    var parent = d3.select(selection.node().parentNode);
    var cloned = parent.insert(node_name);
                 //.attr("id", selection.attr("id") + i);
    for (var j = 0; j < length; j++) { // Iterate on attributes and skip on "id"
        if (attr[j].nodeName == "id") continue;
        cloned.attr(attr[j].name,attr[j].value);
    }
    return cloned;
}
*/

////////////////////////////////////////////////
loadData();
d3.select("#graphs-container").on("click",outclick);
d3.selectAll(".legende .parti-button").on("click", selectParti);
	
//FIXME : seems not to work anyway -> problem of loading, if interaction before full load-> glitches
function hackForceRedrawSafari() {
	document.getElementById('graphs-container').style.cssText += ';-webkit-transform:rotateZ(0deg)';
    document.getElementById('graphs-container').offsetHeight;
    document.getElementById('graphs-container').style.cssText += ';-webkit-transform:none' ;
}
//FIXME : rien ne marche. Remplacer par un message: la visualisation ne s'affiche pas correctement ? Installez un navigateur récent,
//comme la dernière version de Chrome ou Firefox.
//FIXME -> l'intégrer à la fin de loadData ? dans le d3.csv...
//window.onload = function() {
//		//force redraw for safari 7
//
////		document.getElementById('#graphs-container').style.cssText += ';-webkit-transform:rotateZ(0deg)';
////		document.getElementById('#graphs-container').offsetHeight;
////		document.getElementById('#graphs-container').style.cssText += ';-webkit-transform:none' ;
//
//		//		document.getElementById('#graphs-container').style.display='none';
////		document.getElementById('#graphs-container').offsetHeight; // no need to store this anywhere, the reference is enough
////		document.getElementById('#graphs-container').style.display='block';
//
////		var c = document.getElementsByName("viewport")[0].getAttribute("content");
////		document.getElementByName("viewport").setAttribute("content", "width=10");
////		document.getElementByName("viewport").setAttribute("content", c);
//	};
//////////////////////////////////////////////////

/*********************** Detect touch only (hack, based on OS only, not reliable **********************/
function isTouchOnlyDevice() {
//	console.log(d3.select(this).node().offsetTop);
//	console.log("depart "+getOffset(d3.select(this).node()).top);
//	console.log("arrivee "+getOffset(document.getElementById("top")).top);
	//if(window.innerWidth <= 800 || window.innerHeight <= 600) {	
	return (/Android|BlackBerry|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent) === true); 
}


/**********************REMOVE DIACRITICS from http://stackoverflow.com/questions/990904/javascript-remove-accents-diacritics-in-strings************/
var defaultDiacriticsRemovalap = [
  {'base':'A', 'letters':'\u0041\u24B6\uFF21\u00C0\u00C1\u00C2\u1EA6\u1EA4\u1EAA\u1EA8\u00C3\u0100\u0102\u1EB0\u1EAE\u1EB4\u1EB2\u0226\u01E0\u00C4\u01DE\u1EA2\u00C5\u01FA\u01CD\u0200\u0202\u1EA0\u1EAC\u1EB6\u1E00\u0104\u023A\u2C6F'},
      {'base':'AA','letters':'\uA732'},
      {'base':'AE','letters':'\u00C6\u01FC\u01E2'},
      {'base':'AO','letters':'\uA734'},
      {'base':'AU','letters':'\uA736'},
      {'base':'AV','letters':'\uA738\uA73A'},
      {'base':'AY','letters':'\uA73C'},
      {'base':'B', 'letters':'\u0042\u24B7\uFF22\u1E02\u1E04\u1E06\u0243\u0182\u0181'},
      {'base':'C', 'letters':'\u0043\u24B8\uFF23\u0106\u0108\u010A\u010C\u00C7\u1E08\u0187\u023B\uA73E'},
      {'base':'D', 'letters':'\u0044\u24B9\uFF24\u1E0A\u010E\u1E0C\u1E10\u1E12\u1E0E\u0110\u018B\u018A\u0189\uA779'},
      {'base':'DZ','letters':'\u01F1\u01C4'},
      {'base':'Dz','letters':'\u01F2\u01C5'},
      {'base':'E', 'letters':'\u0045\u24BA\uFF25\u00C8\u00C9\u00CA\u1EC0\u1EBE\u1EC4\u1EC2\u1EBC\u0112\u1E14\u1E16\u0114\u0116\u00CB\u1EBA\u011A\u0204\u0206\u1EB8\u1EC6\u0228\u1E1C\u0118\u1E18\u1E1A\u0190\u018E'},
      {'base':'F', 'letters':'\u0046\u24BB\uFF26\u1E1E\u0191\uA77B'},
      {'base':'G', 'letters':'\u0047\u24BC\uFF27\u01F4\u011C\u1E20\u011E\u0120\u01E6\u0122\u01E4\u0193\uA7A0\uA77D\uA77E'},
      {'base':'H', 'letters':'\u0048\u24BD\uFF28\u0124\u1E22\u1E26\u021E\u1E24\u1E28\u1E2A\u0126\u2C67\u2C75\uA78D'},
      {'base':'I', 'letters':'\u0049\u24BE\uFF29\u00CC\u00CD\u00CE\u0128\u012A\u012C\u0130\u00CF\u1E2E\u1EC8\u01CF\u0208\u020A\u1ECA\u012E\u1E2C\u0197'},
      {'base':'J', 'letters':'\u004A\u24BF\uFF2A\u0134\u0248'},
      {'base':'K', 'letters':'\u004B\u24C0\uFF2B\u1E30\u01E8\u1E32\u0136\u1E34\u0198\u2C69\uA740\uA742\uA744\uA7A2'},
      {'base':'L', 'letters':'\u004C\u24C1\uFF2C\u013F\u0139\u013D\u1E36\u1E38\u013B\u1E3C\u1E3A\u0141\u023D\u2C62\u2C60\uA748\uA746\uA780'},
      {'base':'LJ','letters':'\u01C7'},
      {'base':'Lj','letters':'\u01C8'},
      {'base':'M', 'letters':'\u004D\u24C2\uFF2D\u1E3E\u1E40\u1E42\u2C6E\u019C'},
      {'base':'N', 'letters':'\u004E\u24C3\uFF2E\u01F8\u0143\u00D1\u1E44\u0147\u1E46\u0145\u1E4A\u1E48\u0220\u019D\uA790\uA7A4'},
      {'base':'NJ','letters':'\u01CA'},
      {'base':'Nj','letters':'\u01CB'},
      {'base':'O', 'letters':'\u004F\u24C4\uFF2F\u00D2\u00D3\u00D4\u1ED2\u1ED0\u1ED6\u1ED4\u00D5\u1E4C\u022C\u1E4E\u014C\u1E50\u1E52\u014E\u022E\u0230\u00D6\u022A\u1ECE\u0150\u01D1\u020C\u020E\u01A0\u1EDC\u1EDA\u1EE0\u1EDE\u1EE2\u1ECC\u1ED8\u01EA\u01EC\u00D8\u01FE\u0186\u019F\uA74A\uA74C'},
      {'base':'OI','letters':'\u01A2'},
      {'base':'OO','letters':'\uA74E'},
      {'base':'OU','letters':'\u0222'},
      {'base':'OE','letters':'\u008C\u0152'},
      {'base':'oe','letters':'\u009C\u0153'},
      {'base':'P', 'letters':'\u0050\u24C5\uFF30\u1E54\u1E56\u01A4\u2C63\uA750\uA752\uA754'},
      {'base':'Q', 'letters':'\u0051\u24C6\uFF31\uA756\uA758\u024A'},
      {'base':'R', 'letters':'\u0052\u24C7\uFF32\u0154\u1E58\u0158\u0210\u0212\u1E5A\u1E5C\u0156\u1E5E\u024C\u2C64\uA75A\uA7A6\uA782'},
      {'base':'S', 'letters':'\u0053\u24C8\uFF33\u1E9E\u015A\u1E64\u015C\u1E60\u0160\u1E66\u1E62\u1E68\u0218\u015E\u2C7E\uA7A8\uA784'},
      {'base':'T', 'letters':'\u0054\u24C9\uFF34\u1E6A\u0164\u1E6C\u021A\u0162\u1E70\u1E6E\u0166\u01AC\u01AE\u023E\uA786'},
      {'base':'TZ','letters':'\uA728'},
      {'base':'U', 'letters':'\u0055\u24CA\uFF35\u00D9\u00DA\u00DB\u0168\u1E78\u016A\u1E7A\u016C\u00DC\u01DB\u01D7\u01D5\u01D9\u1EE6\u016E\u0170\u01D3\u0214\u0216\u01AF\u1EEA\u1EE8\u1EEE\u1EEC\u1EF0\u1EE4\u1E72\u0172\u1E76\u1E74\u0244'},
      {'base':'V', 'letters':'\u0056\u24CB\uFF36\u1E7C\u1E7E\u01B2\uA75E\u0245'},
      {'base':'VY','letters':'\uA760'},
      {'base':'W', 'letters':'\u0057\u24CC\uFF37\u1E80\u1E82\u0174\u1E86\u1E84\u1E88\u2C72'},
      {'base':'X', 'letters':'\u0058\u24CD\uFF38\u1E8A\u1E8C'},
      {'base':'Y', 'letters':'\u0059\u24CE\uFF39\u1EF2\u00DD\u0176\u1EF8\u0232\u1E8E\u0178\u1EF6\u1EF4\u01B3\u024E\u1EFE'},
      {'base':'Z', 'letters':'\u005A\u24CF\uFF3A\u0179\u1E90\u017B\u017D\u1E92\u1E94\u01B5\u0224\u2C7F\u2C6B\uA762'},
      {'base':'a', 'letters':'\u0061\u24D0\uFF41\u1E9A\u00E0\u00E1\u00E2\u1EA7\u1EA5\u1EAB\u1EA9\u00E3\u0101\u0103\u1EB1\u1EAF\u1EB5\u1EB3\u0227\u01E1\u00E4\u01DF\u1EA3\u00E5\u01FB\u01CE\u0201\u0203\u1EA1\u1EAD\u1EB7\u1E01\u0105\u2C65\u0250'},
      {'base':'aa','letters':'\uA733'},
      {'base':'ae','letters':'\u00E6\u01FD\u01E3'},
      {'base':'ao','letters':'\uA735'},
      {'base':'au','letters':'\uA737'},
      {'base':'av','letters':'\uA739\uA73B'},
      {'base':'ay','letters':'\uA73D'},
      {'base':'b', 'letters':'\u0062\u24D1\uFF42\u1E03\u1E05\u1E07\u0180\u0183\u0253'},
      {'base':'c', 'letters':'\u0063\u24D2\uFF43\u0107\u0109\u010B\u010D\u00E7\u1E09\u0188\u023C\uA73F\u2184'},
      {'base':'d', 'letters':'\u0064\u24D3\uFF44\u1E0B\u010F\u1E0D\u1E11\u1E13\u1E0F\u0111\u018C\u0256\u0257\uA77A'},
      {'base':'dz','letters':'\u01F3\u01C6'},
      {'base':'e', 'letters':'\u0065\u24D4\uFF45\u00E8\u00E9\u00EA\u1EC1\u1EBF\u1EC5\u1EC3\u1EBD\u0113\u1E15\u1E17\u0115\u0117\u00EB\u1EBB\u011B\u0205\u0207\u1EB9\u1EC7\u0229\u1E1D\u0119\u1E19\u1E1B\u0247\u025B\u01DD'},
      {'base':'f', 'letters':'\u0066\u24D5\uFF46\u1E1F\u0192\uA77C'},
      {'base':'g', 'letters':'\u0067\u24D6\uFF47\u01F5\u011D\u1E21\u011F\u0121\u01E7\u0123\u01E5\u0260\uA7A1\u1D79\uA77F'},
      {'base':'h', 'letters':'\u0068\u24D7\uFF48\u0125\u1E23\u1E27\u021F\u1E25\u1E29\u1E2B\u1E96\u0127\u2C68\u2C76\u0265'},
      {'base':'hv','letters':'\u0195'},
      {'base':'i', 'letters':'\u0069\u24D8\uFF49\u00EC\u00ED\u00EE\u0129\u012B\u012D\u00EF\u1E2F\u1EC9\u01D0\u0209\u020B\u1ECB\u012F\u1E2D\u0268\u0131'},
      {'base':'j', 'letters':'\u006A\u24D9\uFF4A\u0135\u01F0\u0249'},
      {'base':'k', 'letters':'\u006B\u24DA\uFF4B\u1E31\u01E9\u1E33\u0137\u1E35\u0199\u2C6A\uA741\uA743\uA745\uA7A3'},
      {'base':'l', 'letters':'\u006C\u24DB\uFF4C\u0140\u013A\u013E\u1E37\u1E39\u013C\u1E3D\u1E3B\u017F\u0142\u019A\u026B\u2C61\uA749\uA781\uA747'},
      {'base':'lj','letters':'\u01C9'},
      {'base':'m', 'letters':'\u006D\u24DC\uFF4D\u1E3F\u1E41\u1E43\u0271\u026F'},
      {'base':'n', 'letters':'\u006E\u24DD\uFF4E\u01F9\u0144\u00F1\u1E45\u0148\u1E47\u0146\u1E4B\u1E49\u019E\u0272\u0149\uA791\uA7A5'},
      {'base':'nj','letters':'\u01CC'},
      {'base':'o', 'letters':'\u006F\u24DE\uFF4F\u00F2\u00F3\u00F4\u1ED3\u1ED1\u1ED7\u1ED5\u00F5\u1E4D\u022D\u1E4F\u014D\u1E51\u1E53\u014F\u022F\u0231\u00F6\u022B\u1ECF\u0151\u01D2\u020D\u020F\u01A1\u1EDD\u1EDB\u1EE1\u1EDF\u1EE3\u1ECD\u1ED9\u01EB\u01ED\u00F8\u01FF\u0254\uA74B\uA74D\u0275'},
      {'base':'oi','letters':'\u01A3'},
      {'base':'ou','letters':'\u0223'},
      {'base':'oo','letters':'\uA74F'},
      {'base':'p','letters':'\u0070\u24DF\uFF50\u1E55\u1E57\u01A5\u1D7D\uA751\uA753\uA755'},
      {'base':'q','letters':'\u0071\u24E0\uFF51\u024B\uA757\uA759'},
      {'base':'r','letters':'\u0072\u24E1\uFF52\u0155\u1E59\u0159\u0211\u0213\u1E5B\u1E5D\u0157\u1E5F\u024D\u027D\uA75B\uA7A7\uA783'},
      {'base':'s','letters':'\u0073\u24E2\uFF53\u00DF\u015B\u1E65\u015D\u1E61\u0161\u1E67\u1E63\u1E69\u0219\u015F\u023F\uA7A9\uA785\u1E9B'},
      {'base':'t','letters':'\u0074\u24E3\uFF54\u1E6B\u1E97\u0165\u1E6D\u021B\u0163\u1E71\u1E6F\u0167\u01AD\u0288\u2C66\uA787'},
      {'base':'tz','letters':'\uA729'},
      {'base':'u','letters': '\u0075\u24E4\uFF55\u00F9\u00FA\u00FB\u0169\u1E79\u016B\u1E7B\u016D\u00FC\u01DC\u01D8\u01D6\u01DA\u1EE7\u016F\u0171\u01D4\u0215\u0217\u01B0\u1EEB\u1EE9\u1EEF\u1EED\u1EF1\u1EE5\u1E73\u0173\u1E77\u1E75\u0289'},
      {'base':'v','letters':'\u0076\u24E5\uFF56\u1E7D\u1E7F\u028B\uA75F\u028C'},
      {'base':'vy','letters':'\uA761'},
      {'base':'w','letters':'\u0077\u24E6\uFF57\u1E81\u1E83\u0175\u1E87\u1E85\u1E98\u1E89\u2C73'},
      {'base':'x','letters':'\u0078\u24E7\uFF58\u1E8B\u1E8D'},
      {'base':'y','letters':'\u0079\u24E8\uFF59\u1EF3\u00FD\u0177\u1EF9\u0233\u1E8F\u00FF\u1EF7\u1E99\u1EF5\u01B4\u024F\u1EFF'},
      {'base':'z','letters':'\u007A\u24E9\uFF5A\u017A\u1E91\u017C\u017E\u1E93\u1E95\u01B6\u0225\u0240\u2C6C\uA763'}
  ];

  var diacriticsMap = {};
  for (var i=0; i < defaultDiacriticsRemovalap.length; i++){
      var letters = defaultDiacriticsRemovalap[i].letters.split("");
      for (var j=0; j < letters.length ; j++){
          diacriticsMap[letters[j]] = defaultDiacriticsRemovalap[i].base;
      }
  }

  // "what?" version ... http://jsperf.com/diacritics/12
  function removeDiacritics (str) {
      return str.replace(/[^\u0000-\u007E]/g, function(a){ 
         return diacriticsMap[a] || a; 
      });
  }
  
  
  
  /************* util function to slide to anchor 
   * from http://stackoverflow.com/questions/17733076/smooth-scroll-anchor-links-without-jquery *************/
/*  
  function slideToAnchor(elem,style,unit,from,to,time,prop) {
	    if( !elem) return;
	    var start = new Date().getTime(),
	        timer = setInterval(function() {
	            var step = Math.min(1,(new Date().getTime()-start)/time);
	            if (prop) {
	                elem[style] = (from+step*(to-from))+unit;
	            } else {
	                elem.style[style] = (from+step*(to-from))+unit;
	            }
	            if( step == 1) clearInterval(timer);
	        },25);
	    elem.style[style] = from+unit;
	}
//
//	window.onload = function () {
//	    var target = document.getElementById("top");
//	    slideToAnchor(document.body, "scrollTop", "", 0, target.offsetTop, 2000, true);
//	};
  
  /********* from http://stackoverflow.com/questions/442404/retrieve-the-position-x-y-of-an-html-element ***/
 /*
  function getOffset( el ) {
	    var _x = 0;
	    var _y = 0;
	    while( el && !isNaN( el.offsetLeft ) && !isNaN( el.offsetTop ) ) {
	        _x += el.offsetLeft - el.scrollLeft;
	        _y += el.offsetTop - el.scrollTop;
	        el = el.offsetParent;
	    }
	    return { top: _y, left: _x };
	}
*/  
})();