// Package assets embeds the console and browser integrations in the gateway binary.
package assets

import "embed"

//go:embed webui.html web/* mimo_sync.user.js extension/*
var Files embed.FS
