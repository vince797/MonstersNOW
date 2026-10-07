#!/usr/bin/env node
const { main } = require("./build-catalog-covers");

main(["halloween-monster-night"]).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
