const assert = require("assert");
const http = require("http");
const { once } = require("events");
const WebSocket = require("ws");
const { attachVoiceSignalingServer } = require("../web/voiceSignaling");

async function main() {
  const server = http.createServer();
  attachVoiceSignalingServer(server);

  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const url = `ws://127.0.0.1:${port}/voice`;
  const sockets = [];

  try {
    const aliceOne = await connect(url, sockets);
    send(aliceOne, {
      type: "join",
      roomId: "alpha",
      peerId: "alice",
      name: "Alice",
    });
    assert.deepStrictEqual(
      (await waitForMessage(aliceOne, msg => msg.type === "peers", "alice peer list")).peers,
      []
    );

    const bob = await connect(url, sockets);
    const bobPeers = waitForMessage(bob, msg => msg.type === "peers", "bob peer list");
    const aliceSeesBob = waitForMessage(
      aliceOne,
      msg => msg.type === "peer-joined" && msg.peerId === "bob",
      "alice sees bob"
    );

    send(bob, {
      type: "join",
      roomId: "alpha",
      peerId: "bob",
      name: "Bob",
    });

    assert(
      (await bobPeers).peers.some(peer => peer.peerId === "alice"),
      "Bob should receive Alice in the existing peer list."
    );
    await aliceSeesBob;

    const aliceTwo = await connect(url, sockets);
    const aliceTwoPeers = waitForMessage(
      aliceTwo,
      msg => msg.type === "peers",
      "replacement alice peer list"
    );
    const aliceOneClosed = once(aliceOne, "close");

    send(aliceTwo, {
      type: "join",
      roomId: "alpha",
      peerId: "alice",
      name: "Alice 2",
    });

    assert(
      (await aliceTwoPeers).peers.some(peer => peer.peerId === "bob"),
      "Replacement Alice should still see Bob."
    );
    await aliceOneClosed;

    const routedOffer = waitForMessage(
      aliceTwo,
      msg => msg.type === "offer" && msg.from === "bob" && msg.marker === "replacement",
      "offer routed to replacement alice"
    );
    send(bob, {
      type: "offer",
      to: "alice",
      marker: "replacement",
    });
    await routedOffer;

    const carol = await connect(url, sockets);
    send(carol, {
      type: "join",
      roomId: "beta",
      peerId: "carol",
      name: "Carol",
    });
    await waitForMessage(carol, msg => msg.type === "peers", "carol beta peer list");

    send(carol, {
      type: "join",
      roomId: "gamma",
      peerId: "carol",
      name: "Carol",
    });
    await waitForMessage(carol, msg => msg.type === "peers", "carol gamma peer list");

    const dave = await connect(url, sockets);
    const davePeers = waitForMessage(dave, msg => msg.type === "peers", "dave peer list");
    send(dave, {
      type: "join",
      roomId: "beta",
      peerId: "dave",
      name: "Dave",
    });

    assert(
      !(await davePeers).peers.some(peer => peer.peerId === "carol"),
      "Carol should be removed from the old room after rejoining another room."
    );
  } finally {
    for (const socket of sockets) {
      socket.close();
    }
    await new Promise(resolve => server.close(resolve));
  }

  console.log("Voice signaling smoke test passed.");
}

function connect(url, sockets) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out connecting to voice signaling server."));
    }, 1000);

    function cleanup() {
      clearTimeout(timer);
      socket.off("open", onOpen);
      socket.off("error", onError);
    }

    function onOpen() {
      cleanup();
      sockets.push(socket);
      resolve(socket);
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    socket.on("open", onOpen);
    socket.on("error", onError);
  });
}

function waitForMessage(socket, predicate, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${label}.`));
    }, 1000);

    function cleanup() {
      clearTimeout(timer);
      socket.off("message", onMessage);
      socket.off("error", onError);
    }

    function onMessage(raw) {
      let message;

      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (predicate(message)) {
        cleanup();
        resolve(message);
      }
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    socket.on("message", onMessage);
    socket.on("error", onError);
  });
}

function send(socket, message) {
  socket.send(JSON.stringify(message));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
