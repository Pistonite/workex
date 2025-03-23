const runServer = (port: number) => {
    console.log("running server on port", port)
    Bun.serve({
        hostname: "0.0.0.0",
        port,
        routes: {
            "/": () => {
                return new Response(Bun.file("dist/index.html"))
            },
            "/index.html": () => {
                return new Response(Bun.file("dist/index.html"))
            },
            "/index.js": () => {
                return new Response(Bun.file("dist/index.js"))
            }
        }
    })
};

runServer(4000);
runServer(4001);
