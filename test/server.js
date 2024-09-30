var express = require("express");
var app = express();
var path = require("path");

// serve some static paths for testing
app.use("/test", express.static(__dirname));
app.use("/src", express.static(path.join(__dirname, "..", "src")));

app.listen(3000, function() {
    console.log("For testing: http://localhost:3000/test/test.html");
});
