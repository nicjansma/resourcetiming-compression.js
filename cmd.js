#!/usr/bin/env node
var program = require("commander");
var fs = require("fs");

program
    .version(JSON.parse(fs.readFileSync("./package.json", "utf-8")).version)
    .option("-o, --output <file>", "Output file")
    .option("-p, --pretty", "Pretty JSON")
    .option("-v, --verbose", "Verbose debugging");

// commands
program.command("decompress <file>")
    .description("decompress file")
    .action(require("./cli/decompress.js"));
program.command("compress <file>")
    .description("compress file")
    .action(require("./cli/compress.js"));

// go
program.parse(process.argv);
