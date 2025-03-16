
console.log("running first server")
Bun.serve({
    hostname: "0.0.0.0",
    port: 4000,
    routes: {
        "/": () => {
            return new Response(Bun.file("src/index.html"))
        },
        "/worker.js": () => {
            return new Response(Bun.file("src/worker.js"))
        }
    }
})
console.log("running second server")
Bun.serve({
    hostname: "0.0.0.0",
    port: 4001,
    routes: {
        "/": () => {
            return new Response(Bun.file("src/popout.html"))
        }
    }
})
