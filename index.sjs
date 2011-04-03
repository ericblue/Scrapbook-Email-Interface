<html>
<head>
<title>Scrapbook POW Interface</title>
</head>
<body>
<?sjs

//
// Scrapbook POW Interface enables webpages to be captured using HTTP.
// Sample URL: http://localhost:6670/scrapbook/?url=http://eric-blue.com
//
// The following code will open the requested URL in a new tab,
// invoke the Firefox plugin Scrapbook's capture method,
// save the content in the designated folder and close the tab.
//
// Place this file in your POW document root under its own directory
// Make sure this location matches the one specified in email2scrapbook.pl
        
function saveContent(contentWin) {

    // Stripped down sbContentSaver.captureWindow and folder creation code from autosave addon
    
    var timeStamp = sbCommonUtils.getTimeStamp().substring(0,8) + "000000";
    var targetURI = "urn:scrapbook:item" + timeStamp;
    
    // Create parent folder if it doesn't exist (MM/DD/YYYY)
    if ( !sbDataSource.exists(sbCommonUtils.RDF.GetResource(targetURI)) ) {
        var fItem = sbCommonUtils.newItem(timeStamp);
        timeStamp.match(/^(\d{4})(\d{2})(\d{2})\d{6}$/);
        fItem.title = (new Date(parseInt(RegExp.$1, 10), parseInt(RegExp.$2, 10) - 1, parseInt(RegExp.$3, 10))).toLocaleDateString();
        fItem.type = "folder";
        // Set to urn:scrapbook:root to save to top-level folder; otherwise
        // lookup correct item ID for the subfolder
        var fRes = sbDataSource.addItem(fItem, "urn:scrapbook:root", 0);
        sbDataSource.createEmptySeq(fRes.Value);
    }
    
    var presetData = [
          null,
          null,
          {
              "images" : sbCommonUtils.getBoolPref("scrapbook.autosave.images", true),
              "styles" : sbCommonUtils.getBoolPref("scrapbook.autosave.styles", true),
              "script" : sbCommonUtils.getBoolPref("scrapbook.autosave.script", true),
          },
          null,
          null,
    ];

    // Note sbContentSaver.captureWindow used to be invoked directly here, but strange behavior with
    // capturing the correct Window title (even after verifying scope was correct)
    
    if ( !sbDataSource.data ) sbDataSource.init();
    sbContentSaver.init(presetData);
    sbContentSaver.item.chars  = contentWin.document.characterSet;
    sbContentSaver.item.source = contentWin.location.href;
    if ( "gBrowser" in window && contentWin == gBrowser.contentWindow ) {
        sbContentSaver.item.icon = gBrowser.mCurrentBrowser.mIconURL;
    }

    sbContentSaver.frameList = sbContentSaver.flattenFrames(contentWin);
    sbContentSaver.selection = null;
    sbContentSaver.item.title = contentWin.document.title;

    sbContentSaver.contentDir = sbCommonUtils.getContentDir(sbContentSaver.item.id);
    sbContentSaver.saveDocumentInternal(contentWin.document, sbContentSaver.name);
    if ( sbContentSaver.item.icon && sbContentSaver.item.type != "image" && sbContentSaver.item.type != "file" ) {
        var iconFileName = sbContentSaver.download(sbContentSaver.item.icon);
        sbContentSaver.favicon = iconFileName;
    }
    if ( sbContentSaver.httpTask[sbContentSaver.item.id] == 0 ) {
        setTimeout(function(){ sbCaptureObserverCallback.onCaptureComplete(sbContentSaver.item); }, 100);
    }

    sbContentSaver.addResource(targetURI, 0);

}

function getCurrentUrl() {
    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"].getService(Components.interfaces.nsIWindowMediator);
    var recentWindow = wm.getMostRecentWindow("navigator:browser");
    return recentWindow ? recentWindow.content.document.location : null;
}

function isValidUrl(str) {
    return url.match(/^https?:\/\/[a-z0-9-\.]+\.[a-z]{2,4}\/?([^\s<>\#%"\,\{\}\\|\\\^\[\]`]+)?$/);
}

// Get query string parameter directly from POW server
// getMostRecentWindow/getCurrentURL only works from within the browser
var url = pow_server.GET['url'];
document.writeln("Requested URL = " + pow_server.REQUEST);

// Open a tab, load URL, onload capture window, and close tab
if (isValidUrl(url)) {
    
    var tab = gBrowser.addTab(url);
    var newTabBrowser = gBrowser.getBrowserForTab(tab);
    var contentWin = gBrowser.getBrowserForTab(tab).contentWindow;

    // Some load events happen multiple times? - keep track here
    var loaded = false;  
    newTabBrowser.addEventListener("load", function () {

        if (!loaded) {
            loaded = true;
            saveContent(contentWin);
            gBrowser.removeTab(tab);
            
        }

    }, true);
    // TODO process for checking if URL is actually saved needs to be made synchronous
    // Eventually move into event listener block after tab is removed.  Have server wait for success.
    document.writeln("SUCCESS: Saved URL = " + url);
    
}
else {
    document.writeln("ERROR: Request to save invalid URL!");
}

?>

</body>
</html>
