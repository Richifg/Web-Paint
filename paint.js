"use strict";
// x and y coordinates of the cursor on the drawing area
let x, y; 
// size of the drawing area and size of "pixel" divs
const [xMax, yMax, pixelSize] = [175, 175, 3];

const undoStack = [];
const redoStack = [];
const drawingManager = {
    // state of the current drawing
    state: "",
    
    // start and end coordinates of the current drawing
    start : [0, 0],
    end : [0, 0],
    
    // list of coodinates of every pixel on the drawing
    coordinates: [],
    
    // list of [coodinates, color] of pixels that were recently edited
    pastColors: [],
    
    // drawing functions
    drawFigure : function(){
        this.pastColors = [];
        for (let i = 0; i < this.coordinates.length; i++) {
            let [x, y] = [this.coordinates[i][0], this.coordinates[i][1]]; 
            let pixel = document.getElementById("P" + x + "_" + y);
            this.pastColors.push([[x, y], pixel.style.backgroundColor])
            pixel.style.backgroundColor = "black";
        }
        document.getElementById("undo").removeAttribute("disabled");
    },    
    drawPen : function (){
        for (let i = 0; i < this.coordinates.length; i++) {
            let [x, y] = [this.coordinates[i][0], this.coordinates[i][1]]; 
            let pixel = document.getElementById("P" + x + "_" + y);
            if (pixel.style.backgroundColor !== "black") {
                this.pastColors.push([[x, y], pixel.style.backgroundColor])
                pixel.style.backgroundColor = "black";
            }
        }
        document.getElementById("undo").removeAttribute("disabled");
    },    
    undo : function (){
        for (let i = 0; i < this.pastColors.length; i++) {
            let [x, y] = [this.pastColors[i][0][0], this.pastColors[i][0][1]];
            let pixel = document.getElementById("P" + x + "_" + y);
            pixel.style.backgroundColor = this.pastColors[i][1];
        }
    },
    
    // event functions
    processLine: function(event, resizePoint) {
        switch (event.type) {
            case "mousedown" :                
                // update current state
                this.state = !resizePoint ? "drawing" : 
                                resizePoint === "start" ? "resizing-start" : "resizing-end"; 
                if(this.state === "drawing") {
                    // begin a new line                    
                    this.pastColors = [];
                    this.start = [x, y];
                    this.end = [x, y];
                    
                    // clean resize boxes if there are any
                    if (resizeBoxManager.startBoxes.length) {resizeBoxManager.deleteBoxes();}
                }            
                break;            
            case "mousemove":
                if (event.buttons == 1) {
                    // determine which is the new coordinate (end by default)
                    let point2edit = this.state === "resizing-start" ? "start" : "end";

                    // recalculate line
                    this[point2edit] = [x, y];
                    this.coordinates = this.getLineCoords();
                    this.undo();
                    this.drawFigure();
                    
                    //move boxes if currently rezising
                    if (this.state !== "drawing") {resizeBoxManager.moveBoxes(point2edit);}                    
                }
                break;
            case "mouseup":
                // determine which is the last coordinate (end by default)
                let point2edit = this.state === "resizing-start" ? "start" : "end";                            

                // draw final version and save edited pixels
                this[point2edit] = [x, y];
                this.coordinates = this.getLineCoords();
                //this.undo();
                //this.drawFigure();
                undoStack.push(this.pastColors);

                // create resize boxes at start/end points if finished drawing
                if (this.state === "drawing") {
                    resizeBoxManager.createBoxes(this.start, "start");
                    resizeBoxManager.createBoxes(this.end, "end");
                }
                
                // clean state
                this.state = ""; break;    
        }
    },    
    processPen: function(event) {
        switch (event.type) {
            case "mousedown":
                this.pastColors = [];
                this.coordinates.push([x, y]);
                this.start = [x, y];
                break;
            case "mousemove":            
                if (event.buttons == 1) {
                    this.end = [x, y]    
                    // check if cursor moved so fast that it jumped from one pixel to another skipping some pixels on its way
                    if (Math.abs((this.start[0] - this.end[0])) > 1 ||
                            Math.abs(this.start[1] - this.end[1]) > 1) {
                        this.coordinates = this.coordinates.concat(this.getLineCoords());
                    } else {this.coordinates.push([x, y]);}
                    this.drawPen();
                    this.start = [x, y];
                }
                break;
            case "mouseup":
                this.coordinates = [];
                undoStack.push(this.pastColors);
                break;
        }
},
    
    //geometry functions
    getLineCoords: function() {        
        const [start, end] = [this.start, this.end]
              
        // if called with same start/end then just return
        if (start.toString() === end.toString()) {
            return [start]
        }

        // find the axis with the most change X or Y
        let [bigAxis, smallAxis] = Math.abs(start[0] - end[0]) >= Math.abs(start[1] - end[1]) ? [0, 1] : [1, 0];
        const [x1, y1, x2, y2] = [start[bigAxis], start[smallAxis], end[bigAxis], end[smallAxis]];

        // get the line equation parameters (y = mx + b)
        const m = (y2 - y1) / (x2 - x1);
        const b = y1 - m * x1;

        // cycle through the line getting the pixel coordinates 
        let lineCoords = [[start[0], start[1]], [end[0], end[1]]];
        const step = x1 <= x2 ? 1 : -1;
        for (let x = x1 + step; x != x2; x += step) {
            let y = Math.round(m * x + b);
            lineCoords.push( bigAxis == 0 ? [x, y] : [y, x]); 
            if (lineCoords.length > 200) {
                let foo;
            }
        }
        return lineCoords;
    },
};
const resizeBoxManager = {
    // relative coordinates of which pixel should have resize boxes at around start and end points
     coordinateMods : [[0, 0],
                       [0, -1],
                       [1, -1],
                       [1, 0],
                       [1, 1],
                       [0, 1],
                       [-1, 1],
                       [-1, 0],
                       [-1, -1]],
    // borders that should be drawn for each of the resize boxes to make them look like a single square
     borderMods : [[], // first resize box is the center which has no border
                   ["top"],
                   ["top", "right"],
                   ["right"],
                   ["right", "bottom"],
                   ["bottom"],
                   ["bottom", "left"],
                   ["left"],
                   ["left", "top"]],
    
    // list of the current active resize boxes
    startBoxes: [],
    endBoxes: [],
    
    
    // resize box functions
    createBoxes: function(coordinates, point) {
        // put a resize box in each of the pixels around the point (start or end)
        let i = 0;
        const manager = this;
        this.coordinateMods.forEach( function (mods) {
            const pixel = document.getElementById("P" + (coordinates[0] + mods[0]) +
                                               "_" + (coordinates[1] + mods[1]));
            
            // pixel might not exist if near the edge of the drawing area
            if (pixel) {
                // create box, set its style (border and size) and append it to pixel
                const resizeBox = document.createElement("div");
                resizeBox.className = "resize-box-" + point;
                let style = manager.borderMods[i].reduce( 
                    (sum,current) => sum += "border-" + current + ": dotted blue 1px;","");
                style += "width: " + pixelSize + "px;" + "height: " + pixelSize + "px;";
                resizeBox.setAttribute("style", style);
                pixel.appendChild(resizeBox);
                
                // keep track of resize boxes
                manager[point + "Boxes"].push(resizeBox);
            }
            i++;
        })
    },    
    moveBoxes: function (point) {
        // check which point's boxes have to be moved
        const [x, y] = point == "start" ? [drawingManager.start[0], drawingManager.start[1]] : 
                                                [drawingManager.end[0], drawingManager.end[1]];
        this[point + "Boxes"].forEach(function(box) {box.parentElement.removeChild(box);})
        
        for (let i = 0; i < this[point + "Boxes"].length; i++){
            const box = this[point +"Boxes"][i];
            
            // get the new pixel for the resize box
            const pixel = document.getElementById("P" + (x + this.coordinateMods[i][0]) + 
                                                  "_" + (y + this.coordinateMods[i][1]));
            if (pixel) {
                pixel.appendChild(box);
            }
        }
    },
    deleteBoxes: function() {
        for (let i = 0; i < this.startBoxes.length; i++){
            if (this.startBoxes[i].parentElement) {
                this.startBoxes[i].parentElement.removeChild(this.startBoxes[i]);
            }
            if (this.endBoxes[i].parentElement) {
                this.endBoxes[i].parentElement.removeChild(this.endBoxes[i]);        
            }
        }
        this.startBoxes = [];
        this.endBoxes = [];
    }
};

function processDrawingAreaMouseEvent(event){    
    const source = event.srcElement;
    updateCoordinates(source);
    switch (source.className) {     
        case "pixel":            
            switch (document.querySelector('input[name="tool"]:checked').value) {
                case "pen":
                    drawingManager.processPen(event);
                    break;
                case "line":
                    drawingManager.processLine(event);
                    break;
            }
            break;
        case "resize-box-start":
            drawingManager.processLine(event, "start");
            break;
        case "resize-obx-end":
            drawingManager.processLine(event, "end");
            break;
    }
}

function updateCoordinates(object) {
    // find the pixel that made the function called
    const pixel = object.className == "pixel" ? object : object.parentElement;    
    
    // get  coordinates from pixel name
    var split = pixel.id.split("_");
    x = parseInt(split[0].substr(1));
    y = parseInt(split[1]);
    document.getElementById("coordinates").innerHTML = "X: " + x + " Y: " + y;
}

function undo() {
    if (undoStack.length) {
        let redoItem = [];
        let pastColors = undoStack.pop();
        // revert every pixel to its previous color
        for (let i = 0; i < pastColors.length; i ++){
            let [x, y] = [pastColors[i][0][0], pastColors[i][0][1]];
            let pixel = document.getElementById("P" + x + "_" + y);
            redoItem[i] = [[x, y], pixel.style.backgroundColor];
            pixel.style.backgroundColor = pastColors[i][1];
        }
        // add to redo stack the item that was just undoed
        redoStack.push(redoItem);
        document.getElementById("redo").removeAttribute("disabled");
    }
    // disable undo button if undo stack is empty
    if (!undoStack.length) {document.getElementById("undo").setAttribute("disabled","")}
    
    // remove resize boxes if there are any
    if (resizeBoxManager.startBoxes.length) {
        resizeBoxManager.deleteBoxes();
    }
}

function redo(){
    if (redoStack.length) {
        let undoItem = [];
        let pastColors = redoStack.pop();
        // revert every pixel to its previous color
        for (let i = 0; i < pastColors.length; i ++) {
            let [x, y] = [pastColors[i][0][0], pastColors[i][0][1]];
            let pixel = document.getElementById("P" + x + "_" + y);
            undoItem.push([[x, y], pixel.style.backgroundColor]);
            pixel.style.backgroundColor = pastColors[i][1];
        }
        // add to undo stack the item that was redoed
        undoStack.push(undoItem);
        document.getElementById("undo").removeAttribute("disabled");
    }
    // disable redo button if redo stack is empty
    if (!redoStack.length) {document.getElementById("redo").setAttribute("disabled","");}
}

function setupDrawingArea() {
    // add all mouse events to the drawing area
    let gridDiv = document.getElementById("drawing-area");
    gridDiv.addEventListener("mousemove", processDrawingAreaMouseEvent, true);
    gridDiv.addEventListener("mousedown", processDrawingAreaMouseEvent, true);
    gridDiv.addEventListener("mouseup", processDrawingAreaMouseEvent, true);
    
    // set drawing area as a grid
    const width  = pixelSize * (xMax + 1);
	gridDiv.setAttribute("style", 
                         "grid-template-columns:repeat(" + xMax + "," + pixelSize + "px);" +
                         "grid-template-rows:repeat(" + yMax + "," + pixelSize + "px);" +
                          "max-width:" + width + "px;");
    
    // fill drawing area with pixels
	for (let y = 0; y < yMax; y++) {
		for (let x = 0; x < xMax; x++) {
			const newPixel = document.createElement("div");
            newPixel.ondragstart = () => false;
			newPixel.className = "pixel";
			newPixel.id = "P" + x + "_" + y;
            gridDiv.appendChild(newPixel);
		}
	}
}

// wait until document finished loading before setting up drawing area
document.addEventListener('DOMContentLoaded', setupDrawingArea());