/**
*
* Photoshop script to do the following:
*
* 1) Rasterize all layers
* 2) Export layer coordinates
* 3) Export layers into separate files
*
* Information is stored in JSON format
*
* Written by Anh Mai for Flipboard
*
**/

#target photoshop;
#include "utils/json2.js";
bringToFront();

///////////////////////////////////
// GLOBALS
///////////////////////////////////

var sourceFilePath = activeDocument.fullName.path + "/";
sourceFilePath = sourceFilePath.toString().match(/([^\.]+)/)[1]
var sourceFileName = activeDocument.name.match(/([^\.]+)/)[1]
var folder = Folder(sourceFilePath + sourceFileName);
// Create folder
if (!folder.exists)
    folder.create();

// Saving some settings
var originalUnits = preferences.rulerUnits;

// Fire off main function
// Suspending time (we are frozen in time!!)
var doc = activeDocument;
doc.suspendHistory("exportLayers", "main();");
doc.activeHistoryState = doc.historyStates[0]

function main()
{
    // Check that we have at least one document opened
    if (documents.length <= 0)
    {
        alert("You don't have any opened documents...");
        return 'cancel';
    }

    preferences.rulerUnits = Units.PIXELS;

    var dimensions = 
    {
        "width": doc.width.value,
        "height": doc.height.value
    };

    var jsonObject = 
    {
        "dimensions": dimensions,
        "foreground": new Array(),
        "background": new Array()
    };

    // Rasterize all layers
    // and crop out anything thats not
    // in the actual canvas
    cropAndRasterize();

    // Merge and flatten all linked layers
    mergeLinked();

    // Now we loop through each layer
    // and save each one out
    // and get its data
    var len = doc.layers.length;
    for (var i = 0; i < len; i++)
    {
        var activeLayer = doc.layers[i];
        if (isEmpty(activeLayer) || !activeLayer.visible)
            continue;
        var jsonData = layerData(activeLayer);
        // check if border
        if (activeLayer.name.match(/^*Border/))
        {
            var fileName = activeLayer.name;
            jsonObject[fileName] = new Array();
            jsonData["file"] = fileName + ".png";
            jsonObject[fileName].push(jsonData);
            saveLayer(activeLayer, fileName);
        }
        else if (activeLayer.name != "background") 
        {
            var fileName = "foreground" + i;
            jsonData["file"] = fileName + ".png";
            jsonObject.foreground.push(jsonData);
            saveLayer(activeLayer, fileName);
        }
        else 
        {
            var fileName = "background";
            jsonData["file"] = fileName + ".png";
            jsonObject.background.push(jsonData);
            saveLayer(activeLayer, fileName);
        }
    }

    // to finish, we save out the JSON object
    saveJSON(jsonObject);

    // Restoring original settings
    preferences.rulerUnits = originalUnits;
}

function contains(item, arr)
{
    var len = arr.length;
    for (var i = 0; i < len; i++)
    {
        if (arr[i] === item)
            return true;
    }
    return false;
}


// the ugliest function in the world
// used to merge linked layers into a single layer
// lots of work around to bypass javascript's
// inherent asynch
function mergeLinked()
{
    var set = []
    var len = doc.layers.length;
    var i = 0;
    while (i < len)
    {
        var layer = doc.layers[i];
        if (layer.linkedLayers.length > 0)
        {
            if (!contains(layer, set))
            {
                var newSet = doc.layerSets.add();
                for (var n = 0, nlen = layer.linkedLayers.length; n < nlen + 1; n++)
                {
                    if (n == nlen)
                    {
                        layer.move(newSet, ElementPlacement.INSIDE);
                        newSet.merge();
                    }
                    else
                    {
                        if (contains(layer.linkedLayers[n], set))
                        {
                            newSet.remove();
                            break;
                        }
                        set.push(layer);
                        layer.linkedLayers[n].move(newSet, ElementPlacement.INSIDE);
                    }
                }
            }
        }
        len = doc.layers.length;
        i = i + 1;
    }
}

function cropAndRasterize()
{
    var len = doc.layers.length;
    var selection = doc.selection.selectAll();
    for (var i = 0; i < len; i++) 
    {
        var layer = doc.layers[i];
        // Rasterize the layer first
        if (layer.visible) 
        {
            doc.activeLayer = layer;
            doc.activeLayer.rasterize(RasterizeType.ENTIRELAYER);
            doc.crop(new Array(0,0,doc.width.value,doc.height.value));
        }
    }
}

// grabs all of the data for a layer and
// put them inside an object literal
function layerData(lay)
{
    var bounds = lay.bounds;
    var width = bounds[2].value - bounds[0].value;
    var height = bounds[3].value - bounds[1].value;
    var fromLeft = bounds[0].value;
    var fromTop = bounds[1].value;
    var fromRight = doc.width.value - bounds[2].value;
    var fromBottom = doc.height.value - bounds[3].value;
    var snap = snapLocation(width, height, fromLeft, fromTop, fromRight, fromBottom);
    var dataObject = {
       "snap" : snap,
       "width": width,
       "height": height,
       "fromLeft": fromLeft,
       "fromTop": fromTop,
       "fromRight": fromRight,
       "fromBottom": fromBottom
    };
    return dataObject;
}

// determines the snap location
// based on input coordinates of the item
function snapLocation(width, height, left, top, right, bottom)
{
    var leftRight = Math.abs(right - left);
    var topBottom = Math.abs(bottom - top);
    var rowMiddle = (leftRight <= width / 2);
    var colMiddle = (topBottom <= height / 2);
    //alert("top: " + top + " bottom: " + bottom + " leftRight: " + leftRight + " topBottom: " + topBottom + " rowMiddle: " + rowMiddle + " colMiddle: " + colMiddle);
    if (rowMiddle && colMiddle)
        return "snapToMiddle";
    if (rowMiddle)
        return "snapHorizontalMiddle";
    if (colMiddle)
        return "snapVerticalMiddle";
    return "snapToCorners";
}

// creates a new document after selecting
// the appropriate layer, then save that
// new document as a separate PNG
// then close the new document
function saveLayer(lay, fileName)
{
    // save dialog settings
    // suppress all dialogs for this function
    var originalDialog = displayDialogs;
    displayDialogs = DialogModes.NO;

    // makes sure we switch to the document
    activeDocument = doc;

    doc.activeLayer = lay;
    var left = lay.bounds[0];
    var top = lay.bounds[1];
    var right = lay.bounds[2];
    var bottom = lay.bounds[3];

    var layWidth = right - left;
    var layHeight = bottom - top;

    doc.selection.select(Array(
                          Array(left, top),
                          Array(right, top),
                          Array(right, bottom),
                          Array(left, bottom)
                         ));

    doc.selection.copy();
    // creates new document and switch to it
    var newDoc = documents.add(layWidth, layHeight, 144, "tempDoc", NewDocumentMode.RGB);

    newDoc.paste();
    newDoc.backgroundLayer.remove();

    var file = new File(folder + "/" + fileName + ".png");

    saveForWeb(newDoc, file);

    newDoc.close(SaveOptions.DONOTSAVECHANGES);
}

// the actual saving function
// saves with optimization for web
// NOTE: this assumes you only have
// one layer in the document!
function saveForWeb(doc, path)
{
    var saveOptions = new ExportOptionsSaveForWeb;
    saveOptions.format = SaveDocumentType.PNG;
    saveOptions.PNG8 = false;
    saveOptions.quality = 100;

    doc.exportDocument(path, ExportType.SAVEFORWEB, saveOptions);
}

// saving our JSON object
function saveJSON(json)
{
    var file = new File(folder + "/info.json");
    file.open('w');
    file.writeln(JSON.stringify(json, null, "\t"));
    file.close();
}

// test if layer is empty
function isEmpty(lay) 
{
    var bound = lay.bounds;
    return (bound[0].value == 0) && (bound[1].value == 0) && (bound[2].value == 0) && (bound[3].value == 0);
}

