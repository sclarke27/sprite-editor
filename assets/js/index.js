class Color {
    constructor() {
        this.r = 0;
        this.g = 0;
        this.b = 0;
    }

    r() {
        return this.r;
    }

    g() {
        return this.g;
    }

    b() {
        return this.b;
    }

    rgb(r, g, b) {
        if (r !== null) {
            this.r = r;
            this.g = g;
            this.b = b;
        }
        return {
            r: this.r,
            g: this.g,
            b: this.b,
        };
    }

    hsl(h, s, l) {
        const newRgb = this.hslToRgb(h, s, l);
        this.r = newRgb[0];
        this.g = newRgb[1];
        this.b = newRgb[2];
        return {
            r: this.r,
            g: this.g,
            b: this.b,
        };
    }

    hslToRgb(h, s, l) {
        var r, g, b;

        if (s == 0) {
            r = g = b = l; // achromatic
        } else {
            var hue2rgb = function hue2rgb(p, q, t) {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
                if ((t < 1.0 / 2, 0)) return q;
                if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
                return p;
            };

            var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            var p = 2 * l - q;
            r = hue2rgb(p, q, h + 1.0 / 3.0);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1.0 / 3.0);
        }

        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }

    rgbToHsl(r, g, b) {
        (r /= 255), (g /= 255), (b /= 255);
        var max = Math.max(r, g, b),
            min = Math.min(r, g, b);
        var h,
            s,
            l = (max + min) / 2;

        if (max == min) {
            h = s = 0; // achromatic
        } else {
            var d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r:
                    h = (g - b) / d + (g < b ? 6 : 0);
                    break;
                case g:
                    h = (b - r) / d + 2;
                    break;
                case b:
                    h = (r - g) / d + 4;
                    break;
            }
            h /= 6;
        }

        return [h, s, l];
    }
}

/**
 * LedMatrixPage class drives the LED Animation page
 * in this code a 'panel' is any LED panel, matrix, array, etx that can be animated
 * It is assumed that every panel has an array of individually addressable RGB LEDs.
 * This class handles the page only. The actual driving and updating of LED panels is handled
 * with Node in /node/main.js of this project.
 */
class SpriteEditorPage {
    dialog = null;
    importUtil = null;
    links = {};
    panelLinks = [];
    panelCommandLink = [];
    ledPixels = [];
    selectedFrame = 0;
    currentPanelId = null;
    pixelGrid = null;
    gridOffsetX = null;
    gridOffsetY = null;
    pixelDivCache = [];
    pixelCanvas = null;
    pixelCanvasCxt = null;

    selectedColor = null;
    selectedSprite = "default";
    selectedColorChip = null;
    activeTool = "brush";
    isFgColorActive = true;
    foregroundColor = null;
    backgroundColor = new Color().rgb(0, 0, 0);

    activeAnimation = null;
    animationListSynced = false;
    spriteList = {};
    animationTimer = null;

    panelList = [];
    panelInfo = null;
    panelWidth = 12;
    panelHeight = 6;

    framesDiv = null;
    frameDivCache = [];
    syncPreview = false;
    ledCommand = "stop";

    constructor() {}

    initialize() {
        // create dialog manager to use later
        this.dialog = new Dialog("overlayBg", "overlayContent", "overlayTitle");
        this.importUtil = new ImportUtil();

        // setup some default values
        this.pixelGrid = document.getElementById("pixelGrid");
        this.framesDiv = document.getElementById("framesContainer");
        this.pixelCanvas = document.getElementById("pixelCanvas");
        this.pixelCanvas.addEventListener("mousedown", this.handleGridEvent.bind(this));
        this.pixelCanvas.addEventListener("mousemove", this.handleGridEvent.bind(this));
        this.pixelCanvasCxt = this.pixelCanvas.getContext("2d");
        this.gridOffsetX = this.pixelGrid.offsetLeft;
        this.gridOffsetY = this.pixelGrid.offsetTop;

        // start page on next render frame
        window.requestAnimationFrame(() => {
            this.start();
        });
    }

    /**
     * Start up Sprite Editor
     */
    start() {
        // draw color pallettes and setup page default state
        this.drawFullColorPallette();
        this.newSprite();
        this.selectColor(new Color().rgb(255, 255, 255));

        // prevent right click on canvas so we can use that as erase pixel
        document.getElementById("pixelCanvas").addEventListener(
            "contextmenu",
            function (e) {
                e.preventDefault();
            },
            false
        );

        // event listener for import button in import dialog
        document.getElementById("gifImportButton").addEventListener("change", this.importSprite.bind(this), false);
        // start key event listener for keyboard shortcuts
        this.keyPressHandler();

        document.body.onresize = () => {
            this.handleResize();
        };

        // start render loop
        window.requestAnimationFrame(() => {
            this.render();
        });
    }

    /**
     * main render loop
     */
    render() {
        // update canvas in pixelGrid
        this.drawPixels();

        // start render loop timer
        window.requestAnimationFrame(() => {
            this.render();
        });
    }

    /**
     * draw current frame to pixel grid canvas
     * this is called on render loop and does not need to be called outside of that
     */
    drawPixels() {
        // make sure we have what we need to work with
        if (!this.ledPixels || this.panelWidth == 0 || this.panelHeight == 0 || Object.keys(this.spriteList).length === 0) {
            return false;
        }

        // get selected animation data from animation list
        const animData = this.spriteList[this.selectedSprite];
        // get frames data for animation
        const framesList = animData.frames;
        // set led pixel data for selected frame
        this.ledPixels = framesList[this.selectedFrame];

        // if there are not pixels, create a new animation to fill things in properly
        if (this.ledPixels.length === 0) {
            this.newSprite();
        }

        // grab current animation pallette
        const pallette = this.spriteList[this.selectedSprite].pallette;

        // create image data on pixel canvas context
        const frameImageData = this.pixelCanvasCxt.createImageData(animData.frameWidth, animData.frameHeight);

        // draw pixels to frameImageData
        let dataIndex = 0;
        for (const pixelIndex in this.ledPixels) {
            const pixel = this.ledPixels[pixelIndex];
            const color = pallette[pixel].split(",");
            frameImageData.data[dataIndex] = parseInt(color[0]);
            frameImageData.data[dataIndex + 1] = parseInt(color[1]);
            frameImageData.data[dataIndex + 2] = parseInt(color[2]);
            frameImageData.data[dataIndex + 3] = 255;
            dataIndex = dataIndex + 4;
        }

        // draw new frame to canvas
        this.pixelCanvasCxt.putImageData(frameImageData, 0, 0);
    }

    handleResize() {
        document.getElementById("pixelGrid").style.width = `calc(${this.panelWidth}px * 32)`;
        document.getElementById("pixelGrid").style.height = `calc(${this.panelHeight}px * 32)`;
        document.getElementById("pixelCanvas").style.width = `calc(${this.panelWidth}px * 32)`;
        document.getElementById("pixelCanvas").style.height = `calc(${this.panelHeight}px * 32)`;

        this.pixelCanvas.width = `${this.panelWidth}`;
        this.pixelCanvas.height = `${this.panelHeight}`;

        this.gridOffsetX = this.pixelGrid.offsetLeft;
        this.gridOffsetY = this.pixelGrid.offsetTop;
    }
    /**
     * Event handler to catch and handle mouse move and mouse down events on pixel canvas
     * @param {event} evt
     */
    handleGridEvent(evt) {
        // grab active color pallette
        const pallette = this.spriteList[this.selectedSprite].pallette;
        //find size of pixels being drawn based on size of pixel canvas
        const gridPixelWidth = this.pixelGrid.offsetWidth / this.panelWidth;
        const gridPixelHeight = this.pixelGrid.offsetHeight / this.panelHeight;

        // determine pixel X,Y of cursor based on pixel size in canvas
        const pixelX = Math.floor((evt.clientX - this.gridOffsetX) / gridPixelWidth);
        const pixelY = Math.floor((evt.clientY - this.gridOffsetY) / gridPixelHeight);
        // find color of pixel under cursor
        const pixelIndex = pixelY * this.panelWidth + pixelX;
        const pixelColorIndex = this.ledPixels[pixelIndex];
        // update info panel
        document.getElementById("cursorXPos").innerText = pixelX;
        document.getElementById("cursorYPos").innerText = pixelY;
        document.getElementById("rgbAtCursor").innerText = pallette[pixelColorIndex];
        // handle left/right mouse clicks
        if (evt.buttons === 1 || evt.buttons === 2) {
            this.selectPixel(evt, pixelIndex, pallette);
        }
    }

    selectTool(toolName) {
        this.activeTool = toolName;
        const toolButtons = document.getElementById("brushTools").children;

        for (let i = 0; i < toolButtons.length; i++) {
            const currButton = toolButtons[i];
            currButton.className = "material-icons";
            if (currButton.id.indexOf(this.activeTool) >= 0) {
                currButton.className += " on";
            }
        }
    }

    /**
     *
     * @param {mouseEvent} evt
     * @param {pixelIndex} index
     * @param {colorPallette} pallette
     */
    selectPixel(evt, index, pallette) {
        const currPixelColor = pallette[this.ledPixels[index]];
        // switch/case is for adding more tools later such as a color picker
        switch (this.activeTool) {
            case "dropper":
                if (evt.buttons === 1) {
                    const colorArr = currPixelColor.split(",");
                    this.selectColor(new Color().rgb(colorArr[0], colorArr[1], colorArr[2]));
                }
                break;
            case "eraser":
                // update pixel color in led pixel array for current frame
                const colorArr = `${this.backgroundColor.r},${this.backgroundColor.g},${this.backgroundColor.b}`;
                const colorIndex = pallette.indexOf(colorArr);
                this.ledPixels[index] = colorIndex;
                // update frame data in animation
                this.spriteList[this.selectedSprite].frames[this.selectedFrame] = this.ledPixels;

                break;

            case "fill":
                if (evt.buttons === 1 || evt.buttons === 2) {
                    let currColorArr = null;
                    // pick what the new color will be based on which mouse button was clicked
                    if (evt.buttons === 1) {
                        currColorArr = `${this.foregroundColor.r},${this.foregroundColor.g},${this.foregroundColor.b}`;
                    } else if (evt.buttons === 2) {
                        currColorArr = `${this.backgroundColor.r},${this.backgroundColor.g},${this.backgroundColor.b}`;
                    }
                    // find color index of new color in active color pallette
                    let palletteIndex = pallette.indexOf(currColorArr);
                    // if color index now found add new color
                    if (palletteIndex < 0) {
                        pallette.push(currColorArr);
                        this.spriteList[this.selectedSprite].pallette = pallette;
                        palletteIndex = pallette.length - 1;
                        this.drawActiveColorPallette();
                    }

                    // update pixel color in led pixel array for current frame
                    const fillColorIndex = pallette.indexOf(currColorArr);

                    // update frame with an area fill using 'fillColorIndex' and starting from where the canvas was clicked
                    this.fillFromPixel(index, fillColorIndex);

                    // update the frames in the selected animation with the updated frame
                    this.spriteList[this.selectedSprite].frames[this.selectedFrame] = this.ledPixels;
                }
                break;

            case "brush":
            default:
                let currColorArr = null;
                // pick what the new color will be based on which mouse button was clicked
                if (evt.buttons === 1) {
                    currColorArr = `${this.foregroundColor.r},${this.foregroundColor.g},${this.foregroundColor.b}`;
                } else if (evt.buttons === 2) {
                    currColorArr = `${this.backgroundColor.r},${this.backgroundColor.g},${this.backgroundColor.b}`;
                }
                // find color index of new color in active color pallette
                let palletteIndex = pallette.indexOf(currColorArr);
                // if color index now found add new color
                if (palletteIndex < 0) {
                    pallette.push(currColorArr);
                    this.spriteList[this.selectedSprite].pallette = pallette;
                    palletteIndex = pallette.length - 1;
                    this.drawActiveColorPallette();
                }
                // update pixel color in led pixel array for current frame
                this.ledPixels[index] = palletteIndex;
                // update frame data in animation
                this.spriteList[this.selectedSprite].frames[this.selectedFrame] = this.ledPixels;

                break;
        }
    }

    /**
     * fill bucket tool. will fill a target area starting from pixel that was clicked.
     * this will call itself recursively in order to fill an area.
     * @param {*} pixelIndex - index of clicked pixel
     * @param {*} colorIndex - color to fill area to
     */
    fillFromPixel(pixelIndex, colorIndex) {
        // console.info('fill', pixelIndex, colorIndex);
        //set current pixel
        if (this.ledPixels[pixelIndex] === colorIndex) {
            return;
        }
        // set some color values
        const previousColorIndex = this.ledPixels[pixelIndex];
        this.ledPixels[pixelIndex] = colorIndex;

        // find neighbor pixels
        const leftPixel = this.ledPixels[pixelIndex - 1];
        const rightPixel = this.ledPixels[pixelIndex + 1];
        const topPixel = this.ledPixels[pixelIndex - this.panelWidth];
        const bottomPixel = this.ledPixels[pixelIndex + this.panelWidth];

        // find edge pixels to limit fill to
        const minHorizontalIndex = Math.floor(pixelIndex / this.panelWidth) * this.panelWidth;
        const maxHorizontalIndex = Math.ceil(pixelIndex / this.panelWidth) * this.panelWidth;
        const minVerticalIndex = pixelIndex - minHorizontalIndex;
        const maxVerticalIndex = this.panelWidth * this.panelHeight - (this.panelWidth - (pixelIndex - Math.floor(pixelIndex / this.panelWidth) * this.panelWidth) - 1);

        // fill to left from current pixel
        if (pixelIndex - 1 >= 0 && pixelIndex - 1 >= minHorizontalIndex) {
            if (leftPixel === previousColorIndex) {
                this.fillFromPixel(pixelIndex - 1, colorIndex);
            }
        }

        // fill to right
        if (pixelIndex + 1 < this.ledPixels.length && pixelIndex + 1 < maxHorizontalIndex) {
            if (rightPixel === previousColorIndex) {
                this.fillFromPixel(pixelIndex + 1, colorIndex);
            }
        }

        // fill up from current pixel
        if (pixelIndex - this.panelWidth >= 0 && pixelIndex - this.panelWidth >= minVerticalIndex) {
            if (topPixel === previousColorIndex) {
                // this.ledPixels[pixelIndex-this.panelWidth] = colorIndex;
                this.fillFromPixel(pixelIndex - this.panelWidth, colorIndex);
            }
        }

        // fill down from current pixel
        if (pixelIndex + this.panelWidth < this.ledPixels.length && pixelIndex + this.panelWidth < maxVerticalIndex) {
            if (bottomPixel === previousColorIndex) {
                // this.ledPixels[pixelIndex+this.panelWidth] = colorIndex;
                this.fillFromPixel(pixelIndex + this.panelWidth, colorIndex);
            }
        }
    }

    /**
     * handle when the RGB sliders change
     */
    updateColorFromSlider() {
        const newR = document.getElementById("redInputRange").value;
        const newB = document.getElementById("blueInputRange").value;
        const newG = document.getElementById("greenInputRange").value;
        this.selectColor(new Color().rgb(newR, newG, newB));
    }

    /**
     * handle when the RGB input fields change
     */
    updateSelectedColor() {
        const newR = document.getElementById("redInput").value;
        const newB = document.getElementById("blueInput").value;
        const newG = document.getElementById("greenInput").value;
        this.selectColor(new Color().rgb(newR, newG, newB));
    }

    /**
     * Draw the elements which make up the frames list row in the preview
     */
    drawFramesListElements() {
        const animData = this.spriteList[this.selectedSprite];
        const framesList = animData.frames;

        for (let i = 0; i < framesList.length; i++) {
            if (!this.frameDivCache[i]) {
                const tempDiv = document.createElement("div");
                tempDiv.addEventListener("click", (evt) => {
                    this.selectFrame(i);
                });
                this.framesDiv.appendChild(tempDiv);

                this.frameDivCache[i] = tempDiv;
                if (i % 5 === 5 - 1 || i === 0 || i === framesList.length - 1) {
                    tempDiv.innerHTML = i + 1;
                } else {
                    tempDiv.innerHTML = "&nbsp;";
                }
                tempDiv.innerHTML += "<div class='marker'>|</div><div class='frameBox'></div>";
            }

            const frameDiv = this.frameDivCache[i];

            if (this.selectedFrame === i) {
                frameDiv.className = "frame selected";
            } else {
                frameDiv.className = "frame";
            }
        }

        while (this.framesDiv.children.length > framesList.length) {
            delete this.frameDivCache[this.framesDiv.children.length - 1];
            this.framesDiv.removeChild(this.framesDiv.children[this.framesDiv.children.length - 1]);
        }
    }

    /**
     * handle selecting a new frame in the animation preview
     * @param {number} frameIndex
     */
    selectFrame(frameIndex) {
        if (frameIndex < 0) {
            frameIndex = 0;
        }
        if (frameIndex >= this.spriteList[this.selectedSprite].frames.length) {
            frameIndex = this.spriteList[this.selectedSprite].frames.length - 1;
        }
        this.selectedFrame = frameIndex;

        this.drawFramesListElements();
    }

    /**
     * delete selected frame from current animation
     */
    deleteFrame() {
        const animData = this.spriteList[this.selectedSprite];
        const framesList = animData.frames;
        if (this.selectedFrame != 0 || (this.selectedFrame == 0 && framesList.length > 1)) {
            const newFrameList = framesList.slice(0, this.selectedFrame).concat(framesList.slice(this.selectedFrame + 1, framesList.length));
            this.spriteList[this.selectedSprite].frames = newFrameList;
            this.selectFrame(this.selectedFrame - 1);
            this.drawFramesListElements();
        }
    }

    /**
     * add a new frame to current animation preview
     */
    addFrame() {
        let newArr = Array.apply(null, Array(this.panelWidth * this.panelHeight));
        let newFramePixels = newArr.map(function (x, i) {
            return "0";
        });
        this.spriteList[this.selectedSprite].frames.push(newFramePixels);
        this.selectFrame(this.spriteList[this.selectedSprite].frames.length - 1);
        this.drawFramesListElements();
    }

    /**
     * duplicate current frame. This will append the duplicated frame to the end of the animation
     */
    duplicateFrame() {
        const newFrame = this.spriteList[this.selectedSprite].frames[this.selectedFrame].slice();
        this.spriteList[this.selectedSprite].frames.push(newFrame);
        this.selectFrame(this.spriteList[this.selectedSprite].frames.length - 1);
        this.drawFramesListElements();
    }

    /**
     * Select an animation to display in the animation preview
     * @param {id} spriteKey
     */
    selectSprite(spriteKey) {
        this.selectedSprite = spriteKey;
        const anim = this.spriteList[this.selectedSprite];
        this.panelWidth = anim.frameWidth;
        this.panelHeight = anim.frameHeight;
        this.handleResize();
        document.getElementById("animName").value = this.spriteList[this.selectedSprite].name;
        document.getElementById("nameIdValue").innerHTML = this.spriteList[this.selectedSprite].id;
        document.getElementById("animSpeed").value = this.spriteList[this.selectedSprite].speed;
        this.selectFrame(0);
        for (let tempDiv of this.frameDivCache) {
            if (tempDiv) {
                this.framesDiv.removeChild(tempDiv);
                delete this.frameDivCache[tempDiv];
            }
        }
        this.frameDivCache = [];
        this.drawFramesListElements();
        this.framesDiv.scrollTo(0, 0);
        this.drawPixels();
        this.drawActiveColorPallette();
    }

    pushFrameSizeToPanel() {
        const animData = this.spriteList[this.selectedSprite];
        const size = {
            width: animData.frameWidth,
            height: animData.frameHeight,
        };
        // swim.command(this.swimUrl, `/ledPanel/${this.currentPanelId}`, 'setFrameSize', size);
    }

    /**
     * play the current active action in the preview panel
     * this mostly just ticks forward the current frame number
     * actual rendering is done in the main animation loop
     */
    playAnimationPreview() {
        this.stopAnimationPreview();
        const playButton = document.getElementById("playButton");
        playButton.innerText = "stop";
        playButton.className = "material-icons on";

        let nextFrame = this.selectedFrame + 1;
        let totalFrames = this.spriteList[this.selectedSprite].frames.length;
        if (nextFrame >= totalFrames) {
            nextFrame = 0;
        }
        this.selectFrame(nextFrame);

        this.animationTimer = setTimeout(this.playAnimationPreview.bind(this), Math.ceil(1000 / this.spriteList[this.selectedSprite].speed));
    }

    /**
     * stop animation playing in preview panel
     */
    stopAnimationPreview() {
        clearInterval(this.animationTimer);
        this.animationTimer = null;
        const playButton = document.getElementById("playButton");
        playButton.innerText = "play_arrow";
        playButton.className = "material-icons";
    }

    /**
     * called by button in ui to toggle preview animation state
     */
    toggleAnimationPreview() {
        if (this.spriteList[this.selectedSprite].frames.length <= 1) {
            return false;
        }
        if (this.animationTimer === null) {
            this.playAnimationPreview();
        } else {
            this.stopAnimationPreview();
        }
    }

    /**
     * Called when clicking on a color chip in either pallette
     * this will update selectedColor to be the color clicked
     * @param {*} color
     */
    selectColor(color = new Color().rgb(255, 255, 255)) {
        // this.selectedColor = new Color().rgb(newR, newG, newB);
        if (this.isFgColorActive) {
            this.foregroundColor = color;
            document.getElementById("foregroundColorChip").style.backgroundColor = `rgb(${this.foregroundColor.r},${this.foregroundColor.g},${this.foregroundColor.b})`;
            document.getElementById("redInput").value = Math.round(this.foregroundColor.r);
            document.getElementById("redInputRange").value = Math.round(this.foregroundColor.r);
            document.getElementById("greenInput").value = Math.round(this.foregroundColor.g);
            document.getElementById("greenInputRange").value = Math.round(this.foregroundColor.g);
            document.getElementById("blueInput").value = Math.round(this.foregroundColor.b);
            document.getElementById("blueInputRange").value = Math.round(this.foregroundColor.b);
        } else {
            this.backgroundColor = color;
            document.getElementById("backgroundColorChip").style.backgroundColor = `rgb(${this.backgroundColor.r},${this.backgroundColor.g},${this.backgroundColor.b})`;
            document.getElementById("redInput").value = Math.round(this.backgroundColor.r);
            document.getElementById("redInputRange").value = Math.round(this.backgroundColor.r);
            document.getElementById("greenInput").value = Math.round(this.backgroundColor.g);
            document.getElementById("greenInputRange").value = Math.round(this.backgroundColor.g);
            document.getElementById("blueInput").value = Math.round(this.backgroundColor.b);
            document.getElementById("blueInputRange").value = Math.round(this.backgroundColor.b);
        }
    }

    toggleFgColorActive() {
        this.isFgColorActive = !this.isFgColorActive;
        document.getElementById("backgroundColorChip").style.zIndex = this.isFgColorActive ? 0 : 1;
        this.selectColor(this.isFgColorActive ? this.foregroundColor : this.backgroundColor);
    }

    /**
     * draw the 'full' rainbow color pallette
     * adjusting the totalColors value will change the total number of color chips rendered
     * into the full color pallette. The code will do its best to provide a full range of colors and shades
     * which fit into that total number. There will always be an additional greyscale row.
     * Values less then 32 or greater then 462 are a bit useless.
     * examples:
     *    32 chips = 6 colors w/ 5 shades each
     *    132 chips = 12 colors w/ 11 shades each
     *    256 chips = 16 colors w/ 16 shades each
     *    462 chip = 22 colors w/ 21 shades each
     */
    drawFullColorPallette() {
        const totalColors = 462;
        const palletteDiv = document.getElementById("colorPallette");
        const totalShades = Math.floor(Math.sqrt(totalColors));
        const palletteWidth = palletteDiv.offsetWidth;
        const colorChipSize = Math.floor(palletteWidth / totalShades);
        let currHue = null;
        let currShade = null;
        let totalChips = 0;
        palletteDiv.innerHTML = ""; // lazy clear the parent div

        // render greys
        for (let i = 0; i < totalShades; i++) {
            const currGrey = Math.round(Utils.interpolate(255, 0, i, totalShades - 1));
            const newColor = new Color().rgb(currGrey, currGrey, currGrey);
            const newColorChip = document.createElement("div");
            newColorChip.id = `colorChip-${totalChips}`;
            newColorChip.style.backgroundColor = `rgb(${newColor.r}, ${newColor.g}, ${newColor.b})`;
            newColorChip.style.height = newColorChip.style.width = `${colorChipSize}px`;
            newColorChip.addEventListener("mousedown", (evt) => {
                page.selectColor(newColor);
            });
            palletteDiv.appendChild(newColorChip);
            totalChips++;
        }

        //render colors
        for (let i = 0; i < totalColors; i++) {
            if (i % totalShades === 0) {
                currHue = Utils.interpolate(0, 1, i, totalColors);
            }
            currShade = Utils.interpolate(0.9, 0, i % totalShades, totalShades);
            const newColor = new Color().hsl(currHue, 1, currShade);
            newColor.r = Math.round(newColor.r);
            newColor.g = Math.round(newColor.g);
            newColor.b = Math.round(newColor.b);
            const newColorChip = document.createElement("div");
            newColorChip.id = `colorChip-${totalChips}`;
            newColorChip.style.backgroundColor = `rgb(${newColor.r}, ${newColor.g}, ${newColor.b})`;
            newColorChip.style.height = newColorChip.style.width = `${colorChipSize}px`;
            newColorChip.addEventListener("mouseup", (evt) => {
                page.selectColor(newColor);
            });

            palletteDiv.appendChild(newColorChip);
            totalChips++;
        }
    }

    /**
     * draw the active color pallette. This should be every unique color in the selected animation.
     */
    drawActiveColorPallette() {
        const pallette = this.spriteList[this.selectedSprite].pallette;
        const palletteDiv = document.getElementById("activePallette");
        const palletteWidth = palletteDiv.offsetWidth;
        const colorChipSize = 12;
        let totalChips = 0;

        palletteDiv.innerHTML = "";
        for (let i = 0; i < pallette.length; i++) {
            const colorArr = pallette[i].split(",");
            const currColor = new Color().rgb(colorArr[0], colorArr[1], colorArr[2]);
            const newColorChip = document.createElement("div");
            // newColorChip.className = (this.selectedColor && this.selectedColor.equals(currColor)) ? "selectedColor" : "";
            newColorChip.id = `colorChip2-${totalChips}`;
            newColorChip.style.backgroundColor = `rgb(${currColor.r}, ${currColor.g}, ${currColor.b})`;
            newColorChip.style.height = newColorChip.style.width = `${colorChipSize}px`;
            newColorChip.addEventListener("mouseup", (evt) => {
                page.selectColor(currColor);
            });

            palletteDiv.appendChild(newColorChip);
            totalChips++;
        }
        if (this.ledCommand === "sync") {
            this.pushPalletteToPanel();
            this.pushFrameSizeToPanel();
        }
    }

    /**
     * create a new empty animation and set it as active
     */
    newSprite() {
        const spriteForm = document.getElementById("newSpriteForm");
        const formElements = spriteForm.elements;
        const spriteWidth = formElements.spriteWidth;
        const spriteHeight = formElements.spriteHeight;

        this.panelWidth = parseInt(spriteWidth.value);
        this.panelHeight = parseInt(spriteHeight.value);
        this.pixelCanvas.width = `${this.panelWidth}`;
        this.pixelCanvas.height = `${this.panelHeight}`;

        const newAnimId = Utils.newGuid();
        const newArr = Array.apply(null, Array(this.panelWidth * this.panelHeight));
        const newframes = [
            newArr.map(function (x, i) {
                return 0;
            }),
        ];

        const newAnimData = {
            id: newAnimId,
            name: "New Sprite",
            speed: 15,
            loop: true,
            frameWidth: this.panelWidth != 0 ? this.panelWidth : 12,
            frameHeight: this.panelHeight != 0 ? this.panelHeight : 6,
            frames: newframes,
            pallette: ["0,0,0"],
        };
        this.spriteList[newAnimId] = newAnimData;
        this.selectSprite(newAnimId);

        this.handleResize();
        this.closeDialog();
    }

    /**
     * load selected sprite into preview
     */
    async loadSprite() {
        this.stopAnimationPreview();

        let fileHandle;
        [fileHandle] = await window.showOpenFilePicker();
        const file = await fileHandle.getFile();
        const contents = await file.text();

        const data = contents.substring(contents.indexOf("{"), contents.lastIndexOf("}") + 1);

        console.info(data);
        const spriteData = JSON.parse(data);
        this.spriteList[spriteData.id] = spriteData;
        this.selectSprite(spriteData.id);
        this.panelWidth = spriteData.frameWidth;
        this.panelHeight = spriteData.frameHeight;

        this.handleResize();

        this.dialog.close();
    }

    /**
     * save current sprite
     */
    async saveSprite() {
        console.info("save data", this.spriteList[this.selectedSprite]);
        const animName = this.spriteList[this.selectedSprite].name.replace(" ", "");
        const fileContent = `const ${animName} = ${JSON.stringify(this.spriteList[this.selectedSprite])}; module.exports = ${animName};`;
        const opts = {
            suggestedName: `${animName}.js`,
            types: [
                {
                    startIn: "pictures",
                    description: "JavaScript file",
                    accept: { "text/javascript": [".js"] },
                },
            ],
        };
        // create a new handle
        let newHandle = await window.showSaveFilePicker(opts);

        // create a FileSystemWritableFileStream to write to
        const writableStream = await newHandle.createWritable();

        // console.info(newHandle, writableStream);
        // write our file
        await writableStream.write(fileContent);

        // close the file and write the contents to disk.
        await writableStream.close();
    }

    /**
     * update current animation name from name input field
     */
    updateName() {
        const newName = document.getElementById("animName").value;
        this.spriteList[this.selectedSprite].name = newName;
    }

    /**
     * update current animation speed from speed input field
     */
    updateSpeed() {
        const newSpeed = document.getElementById("animSpeed").value;
        this.spriteList[this.selectedSprite].speed = newSpeed;
        if (this.animationTimer !== null) {
            this.playAnimationPreview();
        }
    }

    /**
     * show overlay dialog
     * @param {*} dialogId
     */
    showDialog(dialogId) {
        this.dialog.open(dialogId);
    }

    /**
     * hide overlay dialog
     */
    closeDialog() {
        this.dialog.close();
    }

    /**
     * start keypress listener to handle keyboard shortcuts
     */
    keyPressHandler() {
        document.onkeydown = (key) => {
            // console.info(key.code)
            const ctrlDown = key.ctrlKey;
            switch (key.code) {
                case "KeyB":
                    if (key.target.id == "") {
                        this.selectTool("brush");
                        key.preventDefault();
                        key.stopPropagation();
                    }
                    break;

                case "KeyE":
                    if (key.target.id == "") {
                        this.selectTool("eraser");
                        key.preventDefault();
                        key.stopPropagation();
                    }
                    break;

                case "KeyI":
                    if (key.target.id == "") {
                        this.selectTool("dropper");
                        key.preventDefault();
                        key.stopPropagation();
                    }
                    break;

                case "KeyG":
                case "KeyF":
                    if (key.target.id == "") {
                        this.selectTool("fill");
                        key.preventDefault();
                        key.stopPropagation();
                    }
                    break;

                case "KeyP":
                case "Space":
                    if (key.target.id == "") {
                        this.toggleAnimationPreview();
                        key.preventDefault();
                        key.stopPropagation();
                    }
                    break;

                case "Comma":
                    if (key.target.id == "") {
                        this.selectFrame(this.selectedFrame - 1);
                        key.preventDefault();
                        key.stopPropagation();
                    }
                    break;

                case "Period":
                    if (key.target.id == "") {
                        this.selectFrame(this.selectedFrame + 1);
                        key.preventDefault();
                        key.stopPropagation();
                    }
                    break;

                case "Enter":
                    if (key.target.id != "") {
                        key.target.blur();
                        if (key.target.id === "animationList") {
                            this.loadSprite();
                        }
                    }
                    break;

                case "KeyS":
                    if (ctrlDown) {
                        this.saveSprite();
                        key.preventDefault();
                        key.stopPropagation();
                    }
                    break;
                case "KeyL":
                    if (ctrlDown) {
                        this.showDialog("loadFileDialog");
                        document.getElementById("animationList").focus();
                        key.preventDefault();
                        key.stopPropagation();
                    }
                    break;

                // case "KeyN":
                //     if (ctrlDown) {
                //       key.preventDefault();
                //       key.stopPropagation();
                //       this.newSprite();
                //       document.getElementById("animationList").focus();

                //     }
                //     break;
            }
        };
    }

    /**
     * Import animation button handler
     * @param {*} evt
     */
    importSprite(evt) {
        // const localFilePath = document.getElementById("gifImportButton").value;
        this.dialog.setTitle("Import Animation");
        const fileBlob = evt.target.files[0];
        const onImport = (newAnim) => {
            console.info("[index]", newAnim);
            this.spriteList[newAnim.id] = newAnim;
            this.dialog.close();
            this.selectSprite(newAnim.id);
        };
        const onUpdate = (updateStr) => {
            this.dialog.setTitle(updateStr);
        };

        this.importUtil.readFile(fileBlob, onImport, onUpdate);
    }
}

/**
 * random helpful utilities used on the page
 */
Utils = {
    newGuid: () => {
        return "xxxxxxxx".replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    },

    interpolate(startValue, endValue, stepNumber, lastStepNumber) {
        return ((endValue - startValue) * stepNumber) / lastStepNumber + startValue;
    },

    setCookie: (cookieName, cookieValue, expireDays) => {
        var newDate = new Date();
        newDate.setTime(newDate.getTime() + expireDays * 24 * 60 * 60 * 1000);
        var expires = "expires=" + newDate.toUTCString();
        document.cookie = cookieName + "=" + cookieValue + ";" + expires + ";path=/";
    },

    getCookie: (cookieName) => {
        var name = cookieName + "=";
        var decodedCookie = decodeURIComponent(document.cookie);
        var cookieValues = decodedCookie.split("=");
        if (cookieValues.length === 2) {
            return cookieValues[1];
        }
        return "";
    },
};
