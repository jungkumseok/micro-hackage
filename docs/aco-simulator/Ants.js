(function(){
/* Helper functions */

// return random integer in [min, max);
function randInt(min, max){
    return Math.floor(Math.random() * (max - min)) + min;
}
function max(arr, prop){
	if (prop) return arr.reduce(function(acc, item){ return item[prop] > acc ? item[prop] : acc }, -Infinity);
	return arr.reduce(function(acc, item){ return item > acc ? item : acc }, -Infinity);
}
function min(arr, prop){
	if (prop) return arr.reduce(function(acc, item){ return item[prop] < acc ? item[prop] : acc }, Infinity);
	return arr.reduce(function(acc, item){ return item < acc ? item : acc }, Infinity);
}
function analyzeArray(vals, Z){
	Z = Z || 1.96	// 95% confidence
	var min = Infinity, max = -Infinity;
	var mean = vals.reduce(function(acc, item){ 
		if (item < min) min = item;
		if (item > max) max = item;
		return item + acc
	}, 0) / vals.length;
	var stdev = Math.sqrt( vals.reduce(function(acc, item){ return acc + Math.pow(item - mean, 2) }, 0) / vals.length );
	var confidence = Z * stdev / Math.sqrt(vals.length);
	return {
		min: min,
		max: max,
		mean: mean,
		stdev: stdev,
		confidence: confidence
	}
}

function mouseInArea(mouseX, mouseY, top, right, bottom, left){
	return (mouseX > left && mouseY > top && mouseX < right && mouseY < bottom)
}

function makeCsv(array2d, separator){
	separator = separator || ','
	var csv = array2d.map(function(row){ return row.join(separator) }).join('\n');
	var blob = new Blob([csv], {type:'text/csv'});
	var url = URL.createObjectURL(blob);
	return url;
}

function EventEmitter(){
	this.__eventHandlers = {};
}
EventEmitter.prototype.emit = function(eventName, eventData){
	if (eventName in this.__eventHandlers){
		this.__eventHandlers[eventName].map(function(callback){
			callback(eventData);
		})	
	}
}
EventEmitter.prototype.emitOnce = function(eventName, eventData){
	if (eventName in this.__eventHandlers){
		this.__eventHandlers[eventName].map(function(callback){
			callback(eventData);
		});
		delete this.__eventHandlers[eventName];
	}
}
EventEmitter.prototype.on = function(eventName, callback){
	if (!(eventName in this.__eventHandlers)) this.__eventHandlers[eventName] = [];
	this.__eventHandlers[eventName].push(callback);
}
EventEmitter.prototype.once = function(eventName, callback){
	var self = this;
	if (!(eventName in this.__eventHandlers)) this.__eventHandlers[eventName] = [];
	var wrapped = function(eventData){
		callback(eventData);
		var ri = self.__eventHandlers[eventName].findIndex(function(item){ return item === wrapped });
		if (ri > -1) self.__eventHandlers[eventName].splice(ri, 1);
	}
	this.__eventHandlers[eventName].push(wrapped);
}


/* Functions for the ACO algorithm */
var alpha = 5;
function squash(x, neighbours){
	return 1 / ( 1 + Math.exp( alpha / (x * neighbours) ) );

}
var C1 = 0.7, C2 = 0.3, Z = 1.96;
function getReward(elapsed, best, upper, neighbours){
	// Naive reward function
	var r = C1 / (1 + Math.exp(elapsed - best));

	// AntNet reward function
	// var upper = mean + Z * Math.sqrt(variance / samples);
	// var r = (C1*best/elapsed) + C2*((upper - best) / ((upper - best) + (elapsed - best)));
	// r = squash(r, neighbours) / squash(1, neighbours);
	if (isNaN(r)) throw "Reward computation error"
	return r;
}

/* A Node representing a "router" */
function Node(xPos, yPos){
	this.id = undefined;
	this.x = xPos;
	this.y = yPos;

	// this.radius = 8;
	this.links = [];

	this.table = {};
	this.stats = {};

	// this.data_ants = [];
	this.data_stats = {};

	this.setUIState('default');
}
Node.prototype.radius = 8;
Node.prototype.colors = {
	default: 'rgb(100,100,250)',
	highlight: 'rgb(200,200,250)',
	selected: 'rgb(240,240,40)',
	source: 'rgb(250,100,100)',
	destination: 'rgb(40,230,40)'
}
Node.prototype.setUIState = function(state){
	if (state in Node.prototype.colors){
		this.uiState = state;
		this.color = Node.prototype.colors[this.uiState];
	}
}
Node.prototype.isConnectedTo = function(node){
	var li = this.links.findIndex(function(link){
		return (link.a === node) || (link.b === node);
	});
	return (li >= 0);
}
Node.prototype.addLink = function(link){
	this.links.push(link);
}
Node.prototype.getRect = function(){
	return [ (this.y - this.radius), (this.x + this.radius), (this.y + this.radius), (this.x - this.radius) ];
}
Node.prototype.initStats = function(dst){
	if (!(dst.id in this.stats)){
		this.stats[dst.id] = {
			mean: 0,
			variance: 0,
			stdev: 0,
			confidence: 0,
			times: [],
			best: 0,
			updated: 0
		};
	}
	if (!(dst.id in this.data_stats)){
		this.data_stats[dst.id] = {
			best: 0,
			times: []
		}
	}
}
Node.prototype.initTable = function(dst){
	if (!(dst.id in this.table)) this.table[dst.id] = this.links.map(function(c,i,arr){ return 1 / arr.length; });
}
Node.prototype.updatePosition = function(x, y){
	this.x = x;
	this.y = y;
	this.links.forEach(function(link){
		link.computeLength();
	});
}
Node.prototype.getBestLink = function(dst){
	this.initTable(dst);
	return this.links[this.table[dst.id].reduce(function(acc, item, index, arr){ return (item > arr[acc]) ? index : acc }, 0)];
}
Node.prototype.getBestLinkIndex = function(dst){
	this.initTable(dst);
	return this.table[dst.id].reduce(function(acc, item, index, arr){ return (item > arr[acc]) ? index : acc }, 0);
}
Node.prototype.highlightLinks = function(dst){
	if (!dst) return;
	var self = this;
	var best = this.getBestLinkIndex(dst);
	this.links.forEach(function(link, index){
		if (index === best){
			link.lineWidth = Link.prototype.lines.best;
			// link.strokeStyle = Link.prototype.colors.best;
		}
		else {
			link.lineWidth = Math.max(1, (Link.prototype.lines.best * (self.table[dst.id][index] / self.table[dst.id][best])) );
		}
	})
}
Node.prototype.highlightBestPath = function(dst, visited, length){
	if (dst === this) return length;
	visited = visited || [];
	length = length || 0;
	if (visited.indexOf(this) > -1) return;
	var link = this.getBestLink(dst);
	link.lineWidth = Link.prototype.lines.best;
	link.strokeStyle = Link.prototype.colors.best;
	var next = (link.a === this) ? link.b : link.a;
	visited.push(this);
	return next.highlightBestPath(dst, visited, length + link.length);
}
Node.prototype.nextFrame = function(context){
	color = this.color;
	context.beginPath();
	context.arc(this.x, this.y, this.radius, 0, 2*Math.PI, false);
	context.fillStyle = color;
	context.fill();
	context.lineWidth = 1;
	context.strokeStyle = '#000';
	context.stroke();
	context.font = "14px Consolas";
	context.fillText(this.id, this.x-4, this.y-14);
}

Node.random = function(xRange, yRange){
	return new Node(
		Math.round(Math.random()*(xRange[1] - xRange[0]))+xRange[0],
		Math.round(Math.random()*(yRange[1] - yRange[0]))+yRange[0]
	);
}

/* Link between two nodes */
function Link(a, b){
	this.a = a;
	this.b = b;
	this.length = Math.sqrt(Math.pow(this.a.x-this.b.x, 2)+Math.pow(this.a.y-this.b.y, 2));

	this.a.addLink(this);
	this.b.addLink(this);

	this.lineWidth = Link.prototype.lines.default;
	this.strokeStyle = Link.prototype.colors.default;
}
Link.prototype.computeLength = function(){
	this.length = Math.sqrt(Math.pow(this.a.x-this.b.x, 2)+Math.pow(this.a.y-this.b.y, 2));
}
Link.prototype.lines = {
	best: 3,
	default: 1
}
Link.prototype.colors = {
	best: '#f00',
	default: '#999'
}
Link.prototype.getOtherEnd = function(node){
	return (this.a === node) ? this.b : this.a;
}
Link.prototype.nextFrame = function(context){
	context.beginPath();
	context.moveTo(this.a.x, this.a.y);
	context.lineTo(this.b.x, this.b.y);
	context.lineWidth = this.lineWidth;
	context.strokeStyle = this.strokeStyle;
	context.stroke();
	// console.log("Link line width "+this.lineWidth);
}

/* Ant that crawls around the nodes */
ANT_FORWARD_COLOR = 'rgb(250,100,100)';
ANT_BACKWARD_COLOR = 'rgb(250,250,40)';
ANT_RADIUS = 3;
ANT_SPEED = 5;

function Ant(src, dst){
	EventEmitter.call(this);

	this.x = src.x;
	this.y = src.y;
	this.dX = undefined;
	this.dY = undefined;
	this.sX = undefined;
	this.sY = undefined;

	this.forward = true;
	this.src = src;
	this.dst = dst;

	this.prev = src;
	this.next = undefined;
	this.current_link = undefined;
	this.current_info = undefined;
	// this.age = 0;

	this.memory = [];
	this.memory_persistent = [];
	this.forward_hop = 0;
	this.backward_hop = 0;

	// aesthetics
	// this.fillColor = ANT_FORWARD_COLOR;
	// this.radius = ANT_RADIUS;
}
Ant.prototype = new EventEmitter();
Ant.prototype.Speed = 5;
Ant.prototype.Epsilon = 0;
Ant.prototype.TTL = 10;
Ant.prototype.radius = 3;
Ant.prototype.fillColor = ANT_FORWARD_COLOR;
Ant.prototype.updateTable = function(node, info){
	var self = this;
	if (!info.arrive){
		console.log(this, node, info);
		throw "Cannot find arrival time! there is something wrong here";
	}
	var elapsed = 0;
	for (var i = this.memory.length; i < this.memory_persistent.length; i++){
		// console.log(this.memory_persistent[i]);
		elapsed += this.memory_persistent[i].arrive - this.memory_persistent[i].leave;
		// console.log(elapsed);
		if (isNaN(elapsed)) throw "Cannot calculate elapsed time! data missing somewhere"
	}

	node.initStats(this.dst);

	var stat = node.stats[this.dst.id];
	stat.times.push(elapsed);
	stat.mean = (stat.mean === 0) ? elapsed : (stat.mean + ((elapsed - stat.mean) / 50));
	stat.variance = stat.variance + ((Math.pow(elapsed - stat.mean, 2) - stat.variance) / 50);
	stat.stdev = Math.sqrt(stat.variance);
	if (stat.times.length > 50) stat.times.shift();
	stat.best = min(stat.times);
	stat.confidence = Z * stat.stdev / Math.sqrt(stat.times.length);
	stat.updated ++;

	var reward = getReward(elapsed, stat.best, stat.mean + stat.confidence, node.links.length);
	// console.log(reward);

	node.initTable(this.dst);
	node.links.forEach(function(link, index, body){
		if (link === info.link){
			node.table[self.dst.id][index] = node.table[self.dst.id][index] + ( reward * (1 - node.table[self.dst.id][index]) );
		}
		else {
			node.table[self.dst.id][index] = node.table[self.dst.id][index] - (reward * node.table[self.dst.id][index]);
		}
	})
}
Ant.prototype.chooseNextLink = function(timestep){
	if (this.x === this.prev.x && this.y === this.prev.y){
		if (this.forward === true){
			if (this.forward_hop === this.TTL){
				this.emitOnce('MaxHopReached', this);
				return;
			}

			if (this.memory.length > 0){
				this.memory[this.memory.length-1].arrive = timestep;
				// this.memory_persistent[this.memory.length-1].arrive = Date.now();
			}

			var rand = Math.random();
			if (rand < this.Epsilon){
				this.current_link = this.prev.links[ randInt(0, this.prev.links.length) ];
				this.next = this.current_link.getOtherEnd(this.prev);
			}
			else {
				this.current_link = this.prev.getBestLink(this.dst);
				this.next = this.current_link.getOtherEnd(this.prev);
			}

			var info = {
				from: this.prev,
				link: this.current_link,
				to: this.next,
				leave: timestep
			}

			this.memory.push(info);
			this.memory_persistent.push(info);
			this.forward_hop ++;
		}
		else {
			if (this.current_info){
				this.updateTable(this.prev, this.current_info);	// Update routing table	
			}

			var info = this.memory.pop();
			this.current_link = info.link;
			this.next = info.from;
			this.backward_hop ++;
			this.current_info = info;
		}
		this.dX = this.Speed * (this.next.x - this.prev.x) / this.current_link.length;
		this.dY = this.Speed * (this.next.y - this.prev.y) / this.current_link.length;
		this.sX = Math.sign(this.dX);
		this.sY = Math.sign(this.dY);
	}
	else {
		throw "Ant is still travelling on a link, cannot choose the next node";
	}
}
Ant.prototype.nextFrame = function(context, timestep){
	var antColor = this.fillColor;

	// If Ant is just starting out, choose a link.
	if (!(this.next)){
		this.chooseNextLink(timestep);
	}
	// If ant has reached destination, begin backward trip.
	else if ((this.forward === true) && (this.x === this.dst.x && this.y === this.dst.y)){
		this.emitOnce('DestinationReached', this);
		this.forward = false;
		this.prev = this.next;
		if (this.memory.length > 0){
			this.memory[this.memory.length-1].arrive = timestep;
		}
		this.chooseNextLink(timestep);

		this.fillColor = ANT_BACKWARD_COLOR;
	}
	else if ((this.forward === false) && (this.x === this.src.x && this.y === this.src.y)){
		this.updateTable(this.prev, this.current_info);	// Update routing table
		this.emitOnce('SourceReached', this);
	}
	// If ant has reached an intermediate link, choose the next link
	else if (this.x === this.next.x && this.y === this.next.y){
		this.prev = this.next;
		this.chooseNextLink(timestep);
	}

	// Update Ant position
	//   If ant will reach the next node, set the position to next node
	if (this.sX * (this.x + this.dX) >= this.sX * this.next.x){
		this.x = this.next.x;
		this.y = this.next.y;
	}
	else {
		this.x += this.dX;
		this.y += this.dY;
	}

	// Render Ant
	context.beginPath();
	context.arc(this.x, this.y, this.radius, 0, 2*Math.PI, false);
	context.fillStyle = antColor;
	context.fill();
	context.lineWidth = 1;
	context.strokeStyle = '#444';
	context.stroke();
}

function DataAnt(src, dst){
	Ant.call(this, src, dst);

}
DataAnt.prototype = Object.create(Ant.prototype);
DataAnt.prototype.radius = 3;
DataAnt.prototype.fillColor = 'rgb(50,50,250)';
DataAnt.prototype.chooseNextLink = function(timestep){
	if (this.x === this.prev.x && this.y === this.prev.y){
		if (this.forward === true){
			if (this.forward_hop === this.TTL){
				this.emitOnce('MaxHopReached', this);
				return;
			}
			if (this.memory.length > 0){
				this.memory[this.memory.length-1].arrive = timestep;
				// this.memory_persistent[this.memory.length-1].arrive = Date.now();
			}
			this.current_link = this.prev.getBestLink(this.dst);
			this.next = this.current_link.getOtherEnd(this.prev);

			var info = {
				from: this.prev,
				link: this.current_link,
				to: this.next,
				leave: timestep
			}

			this.memory.push(info);
			// this.memory_persistent.push(info);
			this.forward_hop ++;
		}
		else {
			var info = this.memory.pop();
			this.current_link = info.link;
			this.next = info.from;
			this.backward_hop ++;
			this.current_info = info;
		}
		this.dX = this.Speed * (this.next.x - this.prev.x) / this.current_link.length;
		this.dY = this.Speed * (this.next.y - this.prev.y) / this.current_link.length;
		this.sX = Math.sign(this.dX);
		this.sY = Math.sign(this.dY);
	}
	else {
		throw "Ant is still travelling on a link, cannot choose the next node";
	}
}
DataAnt.prototype.nextFrame = function(context, timestep){
	var antColor = this.fillColor;

	// If Ant is just starting out, choose a link.
	if (!(this.next)){
		this.chooseNextLink(timestep);
	}
	// If ant has reached destination, begin backward trip.
	else if ((this.forward === true) && (this.x === this.dst.x && this.y === this.dst.y)){
		this.emitOnce('DestinationReached', this);
		this.forward = false;
		this.prev = this.next;
		if (this.memory.length > 0){
			this.memory[this.memory.length-1].arrive = timestep;
		}
		this.chooseNextLink(timestep);

		// this.fillColor = ANT_BACKWARD_COLOR;
	}
	else if ((this.forward === false) && (this.x === this.src.x && this.y === this.src.y)){
		this.emitOnce('SourceReached', this);
	}
	// If ant has reached an intermediate link, choose the next link
	else if (this.x === this.next.x && this.y === this.next.y){
		this.prev = this.next;
		this.chooseNextLink(timestep);
	}

	// Update Ant position
	//   If ant will reach the next node, set the position to next node
	if (this.sX * (this.x + this.dX) >= this.sX * this.next.x){
		this.x = this.next.x;
		this.y = this.next.y;
	}
	else {
		this.x += this.dX;
		this.y += this.dY;
	}

	// Render Ant
	context.beginPath();
	context.arc(this.x, this.y, this.radius, 0, 2*Math.PI, false);
	context.fillStyle = antColor;
	context.fill();
	context.lineWidth = 1;
	context.strokeStyle = '#444';
	context.stroke();
}

/** Angular App */
var jbApp = angular.module('jbApp', ['nvd3']);
jbApp.config(['$compileProvider', function($compileProvider){
	$compileProvider.aHrefSanitizationWhitelist(/^\s*(|blob|):/);
}])
.directive('acoSimulator', function(){
	return {
		restrict: 'E',
		scope: {
		},
		controller: ['$scope', '$element', '$q', '$interval', '$timeout', function($scope, $element, $q, $interval, $timeout){
			var self = this;

			self.options = Object.assign({
				nodes: 25,
				// link_density: 0.05,
				link_per_node: 2,
				ant_speed: 20,
				ant_generation: 3000,
				ant_epsilon: 1.0,
				width: 600,
				height: 400
			}, {});
			Ant.prototype.Epsilon = self.options.ant_epsilon;
			Ant.prototype.Speed = self.options.ant_speed;

			// Init objects
			var nodes = [];
			var links = [];
			var ants = [];
			var data_ants = [];
			var antTimer = null;
			self.mousePos = { x: null, y: null };
			self.status = 'paused';
			self.link_count = 0;
			self.ants_current = ants.length;
			self.ants_generated = 0;
			self.ants_lost = 0;
			self.timestep = 0;
			self.selNode = undefined;
			self.srcNode = undefined;
			self.dstNode = undefined;

			self.best_path = undefined;
			self.converged_at = undefined;
			self.onConverge = undefined;

			// Init UI stuff
			var viewport = $('.viewport', $element);
			var mouseOffset = viewport.offset();
			var netCanvas = $('.net-canvas', $element);
			var antCanvas = $('.ant-canvas', $element);
			var netCtx = netCanvas[0].getContext('2d');
			var antCtx = antCanvas[0].getContext('2d');
			netCtx.globalCompositeOperation = 'destination-over';
			antCtx.globalCompositeOperation = 'destination-over';

			$(viewport).css({
				position: 'relative',
				width: self.options.width+'px',
				height: self.options.height+'px',
				border: '1px solid #ddd'
			});
			$(netCanvas).css({
				position: 'absolute',
				zIndex: 1
			});
			netCanvas[0].width = self.options.width;
			netCanvas[0].height = self.options.height;
			$(antCanvas).css({
				position: 'absolute',
				zIndex: 2
			});
			antCanvas[0].width = self.options.width;
			antCanvas[0].height = self.options.height;

			// Attach event listeners
			var dragNode = null;
			$(viewport).on('mousemove', function(event){
				// console.log("Mouse at "+event.pageX+', '+event.pageY);
				self.mousePos.x = event.pageX - mouseOffset.left, self.mousePos.y = event.pageY - mouseOffset.top;

				nodes.forEach(function(node){
					if (mouseInArea(self.mousePos.x, self.mousePos.y, node.y-node.radius, node.x+node.radius, node.y+node.radius, node.x-node.radius)){
						node.color = Node.prototype.colors.highlight;
					}
					else {
						node.color = Node.prototype.colors[node.uiState];
					}
				});
				if (dragNode && event.buttons === 1 && self.status === 'edit'){
					dragNode.updatePosition(self.mousePos.x, self.mousePos.y);
				}
			});
			$(viewport).on('mouseout', function(){
				self.mousePos.x = null;
				self.mousePos.y = null;
			});
			$(viewport).on('mouseup', function(event){
				// console.log("Clicked "+event.pageX+', '+event.pageY);
				if (self.selNode){
					if (self.selNode === self.srcNode) self.selNode.setUIState('source');
					else if (self.selNode === self.dstNode) self.selNode.setUIState('destination');
					else self.selNode.setUIState('default');
				}

				var selected = nodes.find(function(node){
					return mouseInArea(self.mousePos.x, self.mousePos.y, node.y-node.radius, node.x+node.radius, node.y+node.radius, node.x-node.radius);
				})
				if (selected){
					selected.setUIState('selected');
					self.selNode = selected;
					// console.log(selected.table, selected.stats);
				}

				dragNode = null;
			});
			$(viewport).on('mousedown', function(event){
				// console.log('Mouse pressed', event);
				if (event.buttons === 1 && self.status === 'edit'){
					for (var i=0; i < nodes.length; i++){
						if (mouseInArea(self.mousePos.x, self.mousePos.y, nodes[i].y-nodes[i].radius, nodes[i].x+nodes[i].radius, nodes[i].y+nodes[i].radius, nodes[i].x-nodes[i].radius)){
							dragNode = nodes[i];
							break;
						}
					}
				}
			})

			// Control functions
			function generateAnts(){
				for (var i=0; i < nodes.length; i++){
					// Direct ants to search toward existing destination
					if (self.dstNode){
						var dst = self.dstNode.id
					}
					// Or pick a random destination
					else {
						var dst = randInt(0, nodes.length);
						// while (dst === i || nodes[i].isConnectedTo(nodes[dst])){
						while (dst === i){
							dst = randInt(0, nodes.length);
						}
					}

					nodes[i].initStats(nodes[dst]);	// Initialize Stats table
					
					var ant = new Ant(nodes[i], nodes[dst]);
					ant.id = self.ants_generated;
					ant.on('DestinationReached', function(ant){
						// console.log('Forward Ant '+ant.id+' Reached in '+ant.forward_hop+' hops!!!', ant.memory_persistent);
						// ant.fillColor = 'rgb(255,0,0)';
						// ant.radius = 4;
					});
					ant.on('SourceReached', function(ant){
						// console.log('Ant '+ant.id+' finished trip '+ant.src.id+' -> '+ant.dst.id+' : f= '+ant.forward_hop+', b= '+ant.backward_hop);

						var ri = ants.findIndex(function(item){ return item === ant; });
						ants.splice(ri, 1);
						self.ants_current = ants.length;
					});
					ant.on('MaxHopReached', function(ant){
						// console.log('Ant '+ant.id+' has exceeded its TTL. Destroying it.');
						var ri = ants.findIndex(function(item){ return item === ant; });
						ants.splice(ri, 1);
						self.ants_current = ants.length;
						self.ants_lost ++;
					})
					ants.push(ant);
					self.ants_current = ants.length;
					self.ants_generated ++;

					//Generate Data Ant
					var data_ant = new DataAnt(nodes[i], nodes[dst]);
					data_ant.leave = self.timestep;
					// ant.on('DestinationReached', function(ant){
					// });
					data_ant.on('SourceReached', function(ant){
						var ri = data_ants.findIndex(function(item){ return item === ant; });
						data_ants.splice(ri, 1);
						ant.src.data_stats[ant.dst.id].times.push({
							x: self.timestep,
							y: (self.timestep - ant.leave)/2
						});
						ant.src.data_stats[ant.dst.id].best = min(ant.src.data_stats[ant.dst.id].times, 'y');
						// console.log("Data Node came back after "+(self.timestep - ant.leave)+' time steps');
					});
					data_ant.on('MaxHopReached', function(ant){
						// console.log('Ant '+ant.id+' has exceeded its TTL. Destroying it.');
						var ri = data_ants.findIndex(function(item){ return item === ant; });
						data_ants.splice(ri, 1);
						// console.log("Data Node died at "+(self.timestep - ant.leave)+' time steps');
					})
					data_ants.push(data_ant);
				}
			}

			self.setSource = function(node){
				if (node === self.dstNode) self.dstNode = null;
				if (self.srcNode) self.srcNode.setUIState('default');
				self.srcNode = node;
				self.srcNode.setUIState('source');
				// highlightBestPath();
			}
			self.setDestination = function(node){
				if (node === self.srcNode) self.srcNode = null;
				if (self.dstNode) self.dstNode.setUIState('default');
				self.dstNode = node;
				self.dstNode.setUIState('destination');
				// highlightBestPath();
			}
			self.unselectNode = function(){
				if (self.selNode) self.selNode.setUIState('default');
				self.selNode = null;
			}

			self.reset = function(){
				// if (antTimer) $interval.cancel(antTimer);
				netCtx.clearRect(0, 0, self.options.width, self.options.height);
				antCtx.clearRect(0, 0, self.options.width, self.options.height);

				nodes = [];
				links = [];
				ants = [];
				data_ants = [];
				self.mousePos = { x: null, y: null };
				// self.status = 'paused';
				self.link_count = 0;
				self.ants_current = ants.length;
				self.ants_generated = 0;
				self.ants_lost = 0;
				self.timestep = 0;
				self.selNode = undefined;
				self.srcNode = undefined;
				self.dstNode = undefined;

				self.converged_at = undefined;

				// Randomly Generate Nodes
				for (var i=0; i < self.options.nodes; i++){
					var node = Node.random([8, self.options.width-8], [8, self.options.height-8]);
					node.id = i;
					nodes.push(node);
					node.nextFrame(netCtx);
				}
				// console.log(this.nodes);

				// Randomly Generate Links
				// var links_per_node = Math.floor(nodes.length * self.options.link_density);
				var links_per_node = self.options.link_per_node;
				for (var i=0; i < nodes.length; i++){
					for (var j=0; j < links_per_node; j++){
						var trial = 0
						var ti = randInt(0, nodes.length);
						while ((ti === i || nodes[i].isConnectedTo(nodes[ti])) && (trial < links_per_node*2)){
							ti = randInt(0, nodes.length);
							trial ++;
						}
						var link = new Link(nodes[i], nodes[ti]);
						links.push(link);
						link.nextFrame(netCtx);
					}
					// console.log(i, this.nodes[i].links);
				}
				self.link_count = links.length;
				Ant.prototype.TTL = 3 * self.link_count;	// Set TTL for ants so that they die if lost in a cycle
				
				// Set Src and Dst right away to measure time
				self.setSource(nodes[0]);
				self.setDestination(nodes[nodes.length-1]);
				self.selNode = nodes[0];
			}

			function highlightBestPath(){
				links.forEach(function(link){
					link.lineWidth = Link.prototype.lines.default;
					link.strokeStyle = Link.prototype.colors.default;
					// link.nextFrame(netCtx);
				})
				if (self.selNode && self.dstNode){
					self.selNode.highlightLinks(self.dstNode);
				}
				if (self.srcNode && self.dstNode){
					var path_length = self.srcNode.highlightBestPath(self.dstNode);
					if (path_length){
						self.best_path = path_length;
						if (!self.converged_at){
							self.converged_at = self.timestep;	// This works only when we set srcNode and dstNode in the first reset
							(self.onConverge && self.onConverge(self.converged_at))
						}
					}
					else {
						self.best_path = undefined;
					}
				}
				links.forEach(function(link){
					link.nextFrame(netCtx);
				})
			}
			// Animation frame
			function nextFrame(){
				netCtx.clearRect(0, 0, self.options.width, self.options.height);
				antCtx.clearRect(0, 0, self.options.width, self.options.height);

				nodes.forEach(function(node){
					node.nextFrame(netCtx);
				})

				highlightBestPath();

				ants.forEach(function(ant){
					ant.nextFrame(antCtx, self.timestep);
				})
				data_ants.forEach(function(ant){
					ant.nextFrame(antCtx, self.timestep);
				})

				if (self.status === 'running'){
					$scope.$evalAsync(function(){
						self.timestep ++;
					});
					window.requestAnimationFrame(nextFrame);
				}
				else if (self.status === 'edit'){
					window.requestAnimationFrame(nextFrame);
				}
			}

			self.resume = function(){
				self.status = 'running';
				generateAnts();
				nextFrame();
				if (!antTimer){
					antTimer = $interval(function(){
						generateAnts();
					}, self.options.ant_generation);
				}
			}
			self.pause = function(){
				if (antTimer) $interval.cancel(antTimer);
				antTimer = null;
				self.status = 'paused';
			}
			self.editNet = function(){
				self.status = 'edit';
				self.timestep = 0;
				ants = [];
				data_ants = [];
				if (antTimer) $interval.cancel(antTimer);
				nextFrame();
			}

			function autoNext(count){
				if (count <= 0) return $q.resolve([]);
				return $q(function(resolve, reject){
						// self.pause();
						self.reset();
						self.onConverge = function(timestep){
							self.converged_at = undefined;
							self.onConverge = undefined;
							self.pause();
							// resolve([timestep]);
							$timeout(function(){
								resolve([timestep]);
							}, 250);
						}
						self.resume();
					}).then(function(result){
						self.autoRunCount ++;
						return autoNext(count - 1)
							.then(function(future_result){
								return result.concat(future_result);
							})
					})
			}

			self.autoRun = function(count){
				self.autoRunCount = 0;
				self.autoRunResults = {
					config: {
						nodes: self.options.nodes,
						link_per_node: self.options.link_per_node,
						ant_speed: self.options.ant_speed,
						ant_generation: self.options.ant_generation,
						ant_epsilon: self.options.ant_epsilon
					}
				};
				return autoNext(count)
					.then(function(result){
						console.log("Finished Auto Run - ", self.status, result);
						self.autoRunResults.result = result;
						self.autoRunResults.stats = analyzeArray(result);
						var result_array = result.map(function(val, index){ return [index, val ]});
						result_array.unshift(
							Object.keys(self.autoRunResults.config), 
							Object.values(self.autoRunResults.config),
							['Mean', self.autoRunResults.stats.mean],
							['Stdev', self.autoRunResults.stats.stdev],
							['Confidence', self.autoRunResults.stats.confidence],
							['Index', 'Converged at']);
						self.autoRunResults.href = makeCsv(result_array);
						self.autoRunResults.session = Date.now();
					})
			}

			// Begin animation
			self.reset();
			self.pause();
			// self.editNet();
			// self.resume();

			// self.autoRun(5).then(function(results){
			// 	console.log(results);
			// })

			$scope.$watch(function(){
					return self.options.ant_speed
				}, function(val){
					Ant.prototype.Speed = val;
				});
			$scope.$watch(function(){
					return self.options.ant_epsilon
				}, function(val){
					Ant.prototype.Epsilon = val;
				});
			$scope.$watch(function(){
				return self.options.ant_generation
			}, function(val){
				if (self.status === 'running'){
					$interval.cancel(antTimer);
					antTimer = $interval(function(){
						generateAnts();
					}, val);	
				}
			})
		}],
		controllerAs: '$aco',
		template: `
			<div style="padding: 10px;">
			<div class="row">
				<div class="col-md-3">
					<div class="card">
						<div class="card-body">
							<div class="form-group">
								<label>Nodes</label>
								<input type="number" ng-model="$aco.options.nodes" class="form-control"/>
							</div>
							<div class="form-group">
								<label>Average Links per Node</label>
								<input type="number" ng-model="$aco.options.link_per_node" class="form-control"/>
							</div>
							<div class="form-group">
								<label>Ant Speed</label>
								<input type="number" ng-model="$aco.options.ant_speed" class="form-control"/>
							</div>
							<div class="form-group">
								<label>Ant Generation (ms)</label>
								<input type="number" ng-model="$aco.options.ant_generation" class="form-control"/>
							</div>
							<div class="form-group">
								<label>Exploration (Epsilon)</label>
								<input type="number" ng-model="$aco.options.ant_epsilon" min="0" max="1" class="form-control"/>
							</div>
							<div class="btn-group">
								<button ng-show="$aco.status !== 'running'" ng-click="$aco.resume()" class="btn btn-primary">
									<i class="fa fa-play"></i> Resume
								</button>
								<button ng-show="$aco.status === 'running'" ng-click="$aco.pause()" class="btn btn-primary">
									<i class="fa fa-pause"></i> Pause
								</button>
								<button ng-show="$aco.status !== 'edit'" ng-click="$aco.editNet()" class="btn btn-warning">
									<i class="fa fa-edit"></i> Edit
								</button>
								<button ng-click="$aco.reset()" class="btn btn-danger">
									<i class="fa fa-refresh"></i> Reset
								</button>
							</div>
						</div>
					</div>

					<div class="card">
						<div class="card-body">
							<p class="card-text">Timestep: {{ $aco.timestep }}</p>
							<p class="card-text">Links: {{ $aco.link_count }}</p>
							<p class="card-text">Ants currently alive: {{$aco.ants_current}}</p>
							<p class="card-text">Total ants generated: {{$aco.ants_generated}}</p>
							<p class="card-text">Total ants lost: {{ $aco.ants_lost }} ({{ (100 * $aco.ants_lost / $aco.ants_generated)|number:1 }} %)</p>
						</div>
					</div>

					<p ng-show="$aco.autoRunCount > 0">Auto Run : {{$aco.autoRunCount}}</p>
					<div ng-show="$aco.status === 'paused'" class="card">
						<div class="form-group" ng-init="autoRunCount = 500">
							<label>Auto Run</label>
							<input type="number" ng-model="autoRunCount" min="1" class="form-control"/>
						</div>
						<button ng-click="$aco.autoRun(autoRunCount)" class="btn btn-primary">
							<i class="fa fa-play"></i> Auto Run Start
						</button>
						<div ng-if="$aco.autoRunResults.result" class="card-text">
							<div style="max-height: 200px; overflow:auto;">
								<table class="table">
									<tr>
										<td>Mean</td>
										<td>{{$aco.autoRunResults.stats.mean}} ± {{$aco.autoRunResults.stats.confidence}}</td>
									</tr>
									<tr ng-repeat="conv in $aco.autoRunResults.result track by $index">
										<td>{{ $index }}</td>
										<td>{{ conv }}</td>
									</tr>
								</table>
							</div>
							<a ng-href="{{$aco.autoRunResults.href}}" download="ACO-result-{{ $aco.autoRunResults.session }}.csv" class="btn btn-success">
								<i class="fa fa-download"></i> Download CSV
							</a>
						</div>
					</div>
					
				</div>
				<div class="col-md-6">
					<div class="viewport">
						<canvas class="net-canvas"></canvas>
						<canvas class="ant-canvas"></canvas>
					</div>
					<div ng-if="$aco.srcNode && $aco.dstNode">
						<p>From Node #{{ $aco.srcNode.id }} to Node #{{ $aco.dstNode.id }} <small>{{ $aco.srcNode.stats[$aco.dstNode.id].updated }} trips completed</small></p>
						<p ng-show="$aco.best_path">Best Path Length: {{ $aco.best_path|number:2 }}</p>
						<p ng-show="$aco.converged_at">Convergence: {{ $aco.converged_at|number:2 }}</p>
						<trip-graph node="$aco.srcNode" destination="$aco.dstNode"></trip-graph>
						<p>Best trip time: {{ $aco.srcNode.data_stats[$aco.dstNode.id].best }}</p>
					</div>
				</div>

				<div class="col-md-3">
					<div ng-show="$aco.selNode" class="card">
						<div class="card-header">
							<span ng-click="$aco.unselectNode()" class="float-right"><i class="fa fa-close"></i></span>
							<h5 class="card-title">Node #{{ $aco.selNode.id }}</h5>
							<div class="btn-group">
								<button ng-show="$aco.selNode !== $aco.srcNode" ng-click="$aco.setSource($aco.selNode)" class="btn btn-danger btn-sm">
									Set Source
								</button>
								<button ng-show="$aco.selNode === $aco.srcNode" ng-click="$aco.srcNode = null" class="btn btn-danger btn-sm">
									Unset Source
								</button>
								<button ng-show="$aco.selNode !== $aco.dstNode" ng-click="$aco.setDestination($aco.selNode)" class="btn btn-success btn-sm">
									Set Destination
								</button>
								<button ng-show="$aco.selNode === $aco.dstNode" ng-click="$aco.dstNode = null" class="btn btn-success btn-sm">
									Unset Destination
								</button>
							</div>
						</div>
						<div ng-if="$aco.dstNode && $aco.dstNode !== $aco.selNode" class="card-body">
							<p>Destination: 
								<span ng-if="$aco.dstNode">Node #{{ $aco.dstNode.id }} - {{ $aco.selNode.stats[$aco.dstNode.id].updated }} trips</span>
							</p>
							<ant-graph node="$aco.selNode" destination="$aco.dstNode" height="140"></ant-graph>
							<p ng-show="$aco.dstNode">Best trip time: {{ $aco.selNode.stats[$aco.dstNode.id].best }}</p>
							<p ng-show="$aco.dstNode">Mean trip time: {{ $aco.selNode.stats[$aco.dstNode.id].mean | number: 4 }} ± {{ $aco.selNode.stats[$aco.dstNode.id].confidence | number: 4 }}</p>
						</div>
						<div class="card-body">
							<h5>Links - {{$aco.selNode.links.length}} total</h5>
							<ul class="list-group">
								<li ng-repeat="link in $aco.selNode.links" class="list-group-item">
									<span ng-if="link.a === $aco.selNode">Node #{{ link.b.id }}</span>
									<span ng-if="link.a !== $aco.selNode">Node #{{ link.a.id }}</span>
									<span ng-if="$aco.dstNode" class="badge badge-pill">{{ $aco.selNode.table[$aco.dstNode.id][$index] | number:4 }}</span>
								</li>
							</ul>
						</div>
					</div>

				</div>
			</div>
			
			</div>`,
		link: function(scope, elem, attrs, ctrl){
			
		}
	}
})
.directive('antGraph', function(){
	return {
		restrict: 'E',
		scope: {
			node: '=',
			destination: '=',
			height: '=?'
		},
		template: '<nvd3 options="$ctrl.graphOptions" data="$ctrl.graphData"></nvd3>',
		controller: function($scope){
			var self = this;
			// $scope.node.initStats($scope.destination);	// Make sure stats table is initialized
			function getData(){
				return $scope.node.stats[$scope.destination.id].times.map(function(item, index){
					return { x: index, y: item }
				})
			}

			self.graphOptions = {
				chart: {
					type: 'lineChart',
					height: ($scope.height || 200),
					margin: {
						top: 25,
						right: 30,
						bottom: 30,
						left: 30
					},
					x: function(d){ return d.x },
					y: function(d){ return d.y },
					// useInteractiveGuideline: true,
					duration: 0,
				}
			};
			self.graphData = [{ values: [], key: 'Trip time' }];

			$scope.$watch('node', function(node){
				if (node) node.initStats($scope.destination);
			})
			$scope.$watch('destination', function(destination){
				if (destination) $scope.node.initStats(destination);
			})
			$scope.$watch(function(){
				return $scope.node.stats[$scope.destination.id].times.length;
			}, function(length){
				self.graphData[0].values = getData();
			});
		},
		controllerAs: '$ctrl'
	}
})
.directive('tripGraph', function(){
	return {
		restrict: 'E',
		scope: {
			node: '=',
			destination: '=',
			height: '=?'
		},
		template: '<nvd3 options="$ctrl.graphOptions" data="$ctrl.graphData"></nvd3>',
		controller: function($scope){
			var self = this;
			$scope.node.initStats($scope.destination);	// Make sure stats table is initialized
			// function getData(){
			// 	return $scope.node.data_stats[$scope.destination.id].times.map(function(item, index){
			// 		return { x: index, y: item }
			// 	})
			// }

			self.graphOptions = {
				chart: {
					type: 'lineChart',
					height: ($scope.height || 200),
					margin: {
						top: 25,
						right: 30,
						bottom: 30,
						left: 30
					},
					x: function(d){ return d.x },
					y: function(d){ return d.y },
					// useInteractiveGuideline: true,
					duration: 0,
				}
			};
			self.graphData = [{ values: $scope.node.data_stats[$scope.destination.id].times, key: 'Trip time' }];

			$scope.$watch('node', function(node){
				if (node) node.initStats($scope.destination);
			})
			$scope.$watch('destination', function(destination){
				if (destination) $scope.node.initStats(destination);
			})
			$scope.$watch(function(){
				return $scope.node.data_stats[$scope.destination.id].times.length;
			}, function(length){
				self.graphData[0].values = $scope.node.data_stats[$scope.destination.id].times;
			});
		},
		controllerAs: '$ctrl'
	}
})

}())