"use strict";
// size of the drawing area and size of "pixel" divs
const [xMax, yMax, pixelSize] = [175, 175, 3];

// works as a state machine using mouse events as inputs
// interacts with all the other managers
const eventManager = {
    // pen is the selected tool by default
    state: "pen",        
    
    // keeps track of current tool which can differ from current state
    tool: "pen",
    
    // resizing requires to keep track of which point is being edited
    point2edit: "start",
    
    // processes mouse events from the drawing-area div
    processDrawingAreaEvent: function(event){                                     
        // check who was the source of the event
        const source = event.srcElement;
        
        // update coordinates 
        const [x, y] = coordinatesManager.updateCoordinates(source);
                
        const em = eventManager;
        switch (em.state) {                
            // paint state is only affected by mousedown events
            case "paint":                
                if (event.state === "mousedown") {                     
                    drawingManager.drawPaint();
                    undoRedoManager.addUndo(drawingManager.pastColors);
                    drawingManage.pastColors = [];
                }
                break;
                
            // pen state requires careful order of actions due to "cursor jumps"
            case "pen":
                switch (event.type) { 
                    case "mousedown":                        
                        drawingManager.start = [x, y];
                        drawingManager.drawPen([x, y]);
                        break;
                    case "mousemove":
                        if (event.buttons >= 1) {
                            drawingManager.drawPen([x, y]);
                            drawingManager.start = [x, y];                            
                        }
                        break;
                    case "mouseup":
                        drawingManager.drawPen([x, y]);
                        undoRedoManager.addUndo(drawingManager.pastColors);
                        drawingManager.pastColors = [];
                        break;
                }
                break;
                                
            // figure state can transition into resize events depending on source of mouse event
            case "figure":                                
                switch (event.type) { 
                    case "mousedown":
                        // check if event was sourced from a "resize-box-start/end" div
                        const startOrEnd = source.className.split("-")[2];
                        if (startOrEnd) {
                            em.point2edit = startOrEnd;
                            em.state = "resize";
                            drawingManager.pastColors = undoRedoManager.removeUndo();
                        } else {
                            drawingManager.pastColors = [];
                            drawingManager.start = [x, y];
                            drawingManager.end = [x, y];
                            resizeBoxManager.deleteBoxes();
                            
                        }
                        break;
                    case "mousemove":
                        if (event.buttons >= 1) {
                            drawingManager.drawFigure([x, y], true, em.tool);
                        }
                        break;
                    case "mouseup":
                        // resize boxes are only neccesary if a figure was drawn
                        if (drawingManager.start.toString() !== drawingManager.end.toString()) {
                            resizeBoxManager.createBoxes(drawingManager.start, "start");
                            resizeBoxManager.createBoxes(drawingManager.end, "end");
                            undoRedoManager.addUndo(drawingManager.pastColors);
                            drawingManager.pastColors = [];
                        }
                        break;
                }
                break;
                
            // no mouse down for resize state because mouse up takes it back to figure state
            case "resize":
                switch (event.type) {
                    case "mousemove":
                        if (event.buttons >= 1) {
                            drawingManager.drawFigure([x, y], true, em.tool, em.point2edit);
                            resizeBoxManager.moveBoxes(em.point2edit)
                        }
                        break;
                    case "mouseup":
                        em.state = "figure";
                        undoRedoManager.addUndo(drawingManager.pastColors);
                        drawingManager.pastColors = [];
                        break;
                }
                break;
        }
        event.stopPropagation();
    },
    
    // process event related to the tool inputs
    processToolEvent: function(event){  
        // check if selected tool changed
        const currentTool = document.querySelector("input[name=tool]:checked").value;        
        if (currentTool !== this.tool) { 
            // leaving a figure/resize event due to tool change requires some cleanup
            if (this.state === "figure" || this.state === "resize") {
                resizeBoxManager.deleteBoxes();
            }
            
            // circle line and square all trigger the figure state
            const newState = currentTool == "paint" || currentTool == "pen" ? currentTool : "figure"
            this.state = newState;
            this.tool = currentTool;
        } 
    },
};

// holds and updates the coordinates of the cursor on the drawing area
const coordinatesManager = {
    // current coordinates of cursor
    coordinates: [0, 0],
    
    updateCoordinates: function(object) {
        // find the pixel that made the function called
        // currently only the resize boxes within pixels can also make the call
        const pixel = object.className == "pixel" ? object : object.parentElement;    

        // get  coordinates from pixel name
        var split = pixel.id.split("_");
        this.coordinates[0] = parseInt(split[0].substr(1));
        this.coordinates[1] = parseInt(split[1]);
        
        // update the coordinates legend as well
        document.getElementById("coordinates").innerHTML = 
            "X: " + this.coordinates[0] + 
            " Y: " + this.coordinates[1];
        return this.coordinates;
    }
};

// manages all the drawings done by the tools (pen, line, circle, paint, etc..)
const drawingManager = {
    
    // start and end coordinates of the current drawing
    start: [0, 0],
    end: [0, 0],
    
    // colors for the left and right buttons
    primary: "black",
    secondary: "white",
    
    // list of [pixelCoodinates, color] that were recently edited
    pastColors: [],
    // function to add items to pastColors avoiding coordinate repeats
    addPastColors: function (coordinates, color) {
        const strPastColors = this.pastColors.join("],[");
        if (strPastColors.search(coordinates.toString()) === -1){
            this.pastColors.push([coordinates, color]);
        }
    },
    
    // tool functions
    drawPaint: function(coordinates){},   
    
    drawPen: function (coordinates){        
        // check if cursor jump from one pixel to another far pixel
        if (Math.abs(this.start[0] - coordinates[0]) > 1 || 
            Math.abs(this.start[1] - coordinates[1]) > 1) {            
            //draw a line interpolating the probable trajectory of the cursor
            this.drawFigure(coordinates);
            
        } else {            
            // get the new pixel to color
            const pixel = document.getElementById("P" + coordinates[0] + "_" + coordinates[1]);
            if (pixel) {            
                this.addPastColors(coordinates, pixel.style.backgroundColor);
                pixel.style.backgroundColor = this.primary;
                this.end = [...coordinates];
            }
        }
    },   
    
    drawFigure: function(lastCoordinates, isRedraw = false, tool = "line", position = "end"){
        // if redrawing then have to clean past drawing
        if (isRedraw) {
            this.drawUndo();
            this.pastColors = [];
        }
                
        // update the last coordinate of the new figure
        this[position] = [...lastCoordinates];
        
        // calculate all the coordinates of the new figure
        let coordinates = []
        switch (tool) {
            case "circle":
            // circle may also be lines if cursor movement is completely vertical/horizontal
            if (this.start[0] !== this.end[0] && this.start[1] !== this.end[1]) {
                coordinates = this.getCircleCoordinates();
                break;
            }
            case "square":
            // squares may be lines if cursor movement is completely vertical/horizontal
            if (this.start[0] !== this.end[0] && this.start[1] !== this.end[1]) {
                coordinates = this.getSquareCoordinates();
                break;
            }
            case "line":
                coordinates = this.getLineCoordinates();
                break;            
        }
        
        // color each coordinate
         for (let i = 0; i < coordinates.length; i++) {
            let [x, y] = [coordinates[i][0], coordinates[i][1]]; 
            let pixel = document.getElementById("P" + x + "_" + y);             
            this.addPastColors([x, y], pixel.style.backgroundColor);
            pixel.style.backgroundColor = this.primary;
        }            
    },  
    
    drawUndo: function() {
        // restore each pixel to its former glory!
        for (let i = 0; i < this.pastColors.length; i++) {
            let [x, y] = [this.pastColors[i][0][0], this.pastColors[i][0][1]];
            let pixel = document.getElementById("P" + x + "_" + y);
            pixel.style.backgroundColor = this.pastColors[i][1];
        }
    },
    
    // geometry function
    getLineCoordinates: function(start = this.start, end = this.end) {              
        // if called with same start/end then just return
        if (start.toString() === end.toString()) {
            return [start];
        }

        // find the axis with the most change X or Y
        let [bigAxis, smallAxis] = Math.abs(start[0] - end[0]) >= Math.abs(start[1] - end[1]) ? [0, 1] : [1, 0];
        const [x1, y1, x2, y2] = [start[bigAxis], start[smallAxis], end[bigAxis], end[smallAxis]];

        // get the line equation parameters (y = mx + b)
        const m = (y2 - y1) / (x2 - x1);
        const b = y1 - m * x1;

        // cycle through the line getting the pixel coordinates 
        let lineCoords = [[start[0], start[1]]];
        const step = x1 <= x2 ? 1 : -1;
        for (let x = x1 + step; x != x2; x += step) {
            let y = Math.round(m * x + b);
            lineCoords.push( bigAxis == 0 ? [x, y] : [y, x]); 
        };
        lineCoords.push([end[0], end[1]]);
        return lineCoords;
    },
    
    getSquareCoordinates: function() {
        // get square coordinates from drawing start and end points
        // x1y1-----x2y1
        // |           |
        // |           |
        // x1y2-----x2y2
        const [x1, y1, x2, y2] = [this.start[0], this.start[1], this.end[0], this.end[1]];
                
        // vertical line coordinates are sliced to avoid repeated corner coordinates
        let coordinates = [].concat(
            this.getLineCoordinates([x1, y1], [x2, y1]),
            this.getLineCoordinates([x2, y2], [x1, y2]),
            this.getLineCoordinates([x1, y1], [x1, y2]).slice(1,-1),
            this.getLineCoordinates([x2, y2], [x2, y1]).slice(1,-1)            
            );
        return coordinates;
    },
    
    getCircleCoordinates: function() {                        
        const [start, end] = [this.start, this.end];
        
        // get circle equation parameters
        // (x-h)^2/a^2 + (y-k)^2/b^2  =  1        
        const [h, k, a, b] = [
            (start[0] + end[0]) / 2,
            (start[1] + end[1]) / 2,
            Math.abs(start[0] - end[0]) / 2,
            Math.abs(start[1] - end[1]) / 2
        ];
                
        //cycle through all x coordinates finding the y's
        const coordinates = [];
        let step = start[0] <= end[0] ? 1 : -1;
        for (let x = start[0]; x !== end[0] + step; x += step) {
            const y1 = Math.round(
                k + Math.sqrt((1 - ((x - h)**2) / (a**2)) * b**2)
            );
             const y2 = Math.round(
                k - Math.sqrt((1 - ((x - h)**2) / (a**2)) * b**2)
            );
            coordinates.push([x, y1]);
            // make sure no repeats are pushed
            if (coordinates.join("$").indexOf(x + "," + y2) === -1) {
                coordinates.push([x, y2]);
            };
        };
                
        // repeat cycle with y to fill out the gaps
        step = start[1] <= end[1] ? 1 : -1;
        for (let y = start[1]; y !== end[1] + step; y += step) {
            const x1 = Math.round(
                h + Math.sqrt((1 - ((y - k)**2) / (b**2)) * a**2) 
            );
             const x2 = Math.round(
                h - Math.sqrt((1 - ((y - k)**2) / (b**2)) * a**2)
            );
            // make sure no repeats are pushed
            if (coordinates.join("$").indexOf(x1 + "," + y) === -1) {
                coordinates.push([x1, y]);
            };
            if (coordinates.join("$").indexOf(x2 + "," + y) === -1) {
                coordinates.push([x2, y]);
            };
        };
        return coordinates;
    },
};

// creates, holds and cleans the resize boxes at the start/end of figures
const resizeBoxManager = {
    // relative coordinates of which pixels should have resize boxes near start/end points of figures
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
     borderMods : [[], // first resize box is the center so  no border
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
                let style = manager.borderMods[i].reduce( 
                    (sum,current) => sum += "border-" + current + ": dotted blue 1px;","");
                style += "width: " + pixelSize + "px;" + "height: " + pixelSize + "px;";
                const resizeBox = document.createElement("div");
                resizeBox.ondragstart = () => false;
                resizeBox.className = "resize-box-" + point;
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
        // lists are clean separately because start and end may have different number of boxes
        // due to start and end points near corners
        for (let i = 0; i < this.startBoxes.length; i++){
            if (this.startBoxes[i].parentElement) {
                this.startBoxes[i].parentElement.removeChild(this.startBoxes[i]);
            }
        }
        this.startBoxes = [];
        
        for (let i = 0; i < this.endBoxes.length; i++){
            if (this.endBoxes[i].parentElement) {
                this.endBoxes[i].parentElement.removeChild(this.endBoxes[i]);        
            }
        }
        this.endBoxes = [];
    }
};

// manages the undo/redo stacks and functions
const undoRedoManager = {
    undoStack: [],
    redoStack: [],
    
    addUndo: function(item) {
        // clean redo stack and disable button
        this.redoStack = [];
        document.getElementById("redo").setAttribute("disabled","");
        
        // add to undo stack and enable button
        this.undoStack.push(item);
        document.getElementById("undo").removeAttribute("disabled");        
    },
    
    removeUndo: function() {
        let undoItem = this.undoStack.pop();
        if (!this.undoStack.length) {
            document.getElementById("undo").setAttribute("disabled","");
        }
        return undoItem;        
    },
    
    undo: function() {
        if (this.undoStack.length) {
            let redoItem = [];
            let pastColors = this.undoStack.pop();
            // revert every pixel to its previous color
            for (let i = 0; i < pastColors.length; i ++){
                let [x, y] = [pastColors[i][0][0], pastColors[i][0][1]];
                let pixel = document.getElementById("P" + x + "_" + y);
                redoItem[i] = [[x, y], pixel.style.backgroundColor];
                pixel.style.backgroundColor = pastColors[i][1];
            }
            // add to redo stack the item that was just undoed
            this.redoStack.push(redoItem);
            document.getElementById("redo").removeAttribute("disabled");
        }
        // disable undo button if undo stack is empty
        if (!this.undoStack.length) {document.getElementById("undo").setAttribute("disabled","")}

        // remove resize boxes if there are any
        if (resizeBoxManager.startBoxes.length) {
            resizeBoxManager.deleteBoxes(); 
        }
    },
    
    redo: function() {
        if (this.redoStack.length) {
            let undoItem = [];
            let pastColors = this.redoStack.pop();
            // revert every pixel to its previous color
            for (let i = 0; i < pastColors.length; i ++) {
                let [x, y] = [pastColors[i][0][0], pastColors[i][0][1]];
                let pixel = document.getElementById("P" + x + "_" + y);
                undoItem.push([[x, y], pixel.style.backgroundColor]);
                pixel.style.backgroundColor = pastColors[i][1];
            }
            // add to undo stack the item that was redoed
            this.undoStack.push(undoItem);
            document.getElementById("undo").removeAttribute("disabled");
        }
        // disable redo button if redo stack is empty
        if (!this.redoStack.length) {document.getElementById("redo").setAttribute("disabled","");}
    }
};

// sets up a grid and fills it with "pixel" divs
function setupDrawingArea() {
    // add all mouse events to the drawing area
    const gridDiv = document.getElementById("drawing-area");
    gridDiv.addEventListener("mousemove", eventManager.processDrawingAreaEvent, true);
    gridDiv.addEventListener("mousedown", eventManager.processDrawingAreaEvent, true);
    gridDiv.addEventListener("mouseup", eventManager.processDrawingAreaEvent, true);
    
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



