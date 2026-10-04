"use strict";

if ("serviceWorker" in navigator) {
    window.addEventListener("load",
        () => {
            navigator.serviceWorker
                .register("sw.js")
                .catch(error => {
                    console.log("Service worker registration failed:", error);
                });
        }
    );
}

const FIRST_SEQUENCE = 100;
const LAST_SEQUENCE = 119;
const WINDOW_SIZE = 4;
const LOST_SEQUENCE = 106;

const sequences = [];

for (let sequence = FIRST_SEQUENCE; sequence <= LAST_SEQUENCE; sequence++) {
    sequences.push(sequence);
}

let model = createModel();


function createPacket(sequence) {
    return {
        sequence,
        sendCount: 0,
        inFlight: false,
        delivered: false,
        lost: false,
        acknowledged: false
    };
}


function createModel() {
    return {
        sender: {
            base: FIRST_SEQUENCE,
            nextSequence: FIRST_SEQUENCE,
            windowSize: WINDOW_SIZE,
            timerSequence: null
        },

        receiver: {
            nextExpected: FIRST_SEQUENCE,
            lastAck: null,
            received: new Set()
        },

        packets: sequences.map(createPacket),

        pendingAction: null,
        history: [],
        complete: false
    };
}


function getPacket(sequence) {
    return model.packets.find(packet =>
        packet.sequence === sequence
    );
}


function windowEnd() {
    return model.sender.base + model.sender.windowSize;
}


function hasWindowSpace() {
    return (
        model.sender.nextSequence < windowEnd() &&
        model.sender.nextSequence <= LAST_SEQUENCE
    );
}


function oldestInFlightPacket() {
    return model.packets.find(packet =>
        packet.inFlight
    );
}


function hasOutstandingPackets() {
    return model.packets.some(packet =>
        packet.sendCount > 0 &&
        !packet.acknowledged
    );
}


function allDataAcknowledged() {
    return model.sender.base > LAST_SEQUENCE;
}


function determineNextEvent() {
    if (model.pendingAction !== null) {
        return model.pendingAction;
    }

    if (hasWindowSpace()) {
        return {
            type: "SEND_DATA",
            sequence: model.sender.nextSequence
        };
    }

    const packet = oldestInFlightPacket();

    if (packet !== undefined) {
        return {
            type: "RECEIVE_DATA",
            sequence: packet.sequence
        };
    }

    if (hasOutstandingPackets()) {
        return {
            type: "TIMEOUT",
            sequence: model.sender.base
        };
    }

    if (allDataAcknowledged()) {
        return {
            type: "COMPLETE"
        };
    }

    return null;
}


function step() {
    if (model.complete) {
        return;
    }

    const event = determineNextEvent();

    if (event === null) {
        return;
    }

    applyEvent(event);

    model.history.push(event);

    render();
}


function applyEvent(event) {
    switch (event.type) {

        case "SEND_DATA":
            sendData(event.sequence);
            break;

        case "RECEIVE_DATA":
            receiveData(event);
            break;

        case "SEND_ACK":
            sendAck(event.sequence);
            break;

        case "RECEIVE_ACK":
            receiveAck(event);
            break;

        case "TIMEOUT":
            timeout(event.sequence);
            break;

        case "RETRANSMIT":
            retransmit(event.sequence);
            break;

        case "COMPLETE":
            model.complete = true;
            model.pendingAction = null;
            break;
    }
}


function sendData(sequence) {
    const packet = getPacket(sequence);

    packet.sendCount++;
    packet.inFlight = true;
    packet.lost = false;

    model.sender.nextSequence = sequence + 1;

    if (model.sender.timerSequence === null) {
        model.sender.timerSequence = model.sender.base;
    }
}


function receiveData(event) {
    const sequence = event.sequence;
    const packet = getPacket(sequence);

    packet.inFlight = false;

    /*
     * Deliberate deterministic loss:
     * only the first transmission of segment 106
     * is lost.
     */
    if (
        sequence === LOST_SEQUENCE &&
        packet.sendCount === 1
    ) {
        packet.lost = true;
        event.lost = true;
        return;
    }

    packet.delivered = true;
    packet.lost = false;

    model.receiver.received.add(sequence);

    /*
     * Cumulative ACK:
     * advance nextExpected while consecutive
     * segments have already been received.
     */
    while (
        model.receiver.received.has(
            model.receiver.nextExpected
        )
    ) {
        model.receiver.nextExpected++;
    }

    model.pendingAction = {
        type: "SEND_ACK",
        sequence: model.receiver.nextExpected
    };
}


function sendAck(sequence) {
    model.receiver.lastAck = sequence;

    model.pendingAction = {
        type: "RECEIVE_ACK",
        sequence
    };
}


function receiveAck(event) {
    const sequence = event.sequence;

    /*
     * Determine whether this is a duplicate BEFORE
     * changing sender.base.
     */
    event.duplicate =
        sequence <= model.sender.base;

    if (event.duplicate) {
        model.pendingAction = null;
        return;
    }

    /*
     * ACK N means that everything before N
     * has been received.
     */
    for (
        let value = model.sender.base;
        value < sequence;
        value++
    ) {
        getPacket(value).acknowledged = true;
    }

    model.sender.base = sequence;

    /*
     * Restart the conceptual timer on the new
     * oldest unacknowledged segment.
     */
    if (
        model.sender.base <
        model.sender.nextSequence
    ) {
        model.sender.timerSequence =
            model.sender.base;
    } else {
        model.sender.timerSequence = null;
    }

    model.pendingAction = null;
}


function timeout(sequence) {
    model.sender.timerSequence = sequence;

    model.pendingAction = {
        type: "RETRANSMIT",
        sequence
    };
}


function retransmit(sequence) {
    const packet = getPacket(sequence);

    packet.sendCount++;
    packet.inFlight = true;
    packet.lost = false;

    model.sender.timerSequence = sequence;
    model.pendingAction = null;
}


function eventDescription(event) {
    switch (event.type) {

        case "SEND_DATA":
            return `sender: SEND segment ${event.sequence}`;

        case "RECEIVE_DATA":

            if (event.lost) {
                return `network: LOSS segment ${event.sequence}`;
            }

            return `receiver: RECEIVE segment ${event.sequence}`;

        case "SEND_ACK":
            return `receiver: SEND ACK ${event.sequence}`;

        case "RECEIVE_ACK":

            if (event.duplicate) {
                return (
                    `sender: RECEIVE duplicate ACK ` +
                    `${event.sequence}`
                );
            }

            return (
                `sender: RECEIVE ACK ${event.sequence}`
            );

        case "TIMEOUT":
            return `sender: TIMEOUT segment ${event.sequence}`;

        case "RETRANSMIT":
            return `sender: RETRANSMIT segment ${event.sequence}`;

        case "COMPLETE":
            return "simulation: COMPLETE";

        default:
            return event.type;
    }
}


function reset() {
    model = createModel();
    render();
}


function render() {
    renderTimeline();
    renderSender();
    renderReceiver();

    document.getElementById("stepButton").disabled =
        model.complete;
}


function renderTimeline() {
    const timeline =
        document.getElementById("timeline");

    const counter =
        document.getElementById("eventCounter");

    timeline.innerHTML = "";

    if (model.history.length === 0) {
        const item =
            document.createElement("div");

        item.className = "timeline-event";
        item.textContent =
            "Simulation ready — press Step.";

        timeline.appendChild(item);

        counter.textContent = "Event 0";

        return;
    }

    /*
     * Newest event first.
     */
    for (
        let index = model.history.length - 1;
        index >= 0;
        index--
    ) {
        const event = model.history[index];

        const item =
            document.createElement("div");

        item.className = "timeline-event";

        if (
            index ===
            model.history.length - 1
        ) {
            item.classList.add("current");
        }

        item.textContent =
            `${index + 1}. ${eventDescription(event)}`;

        timeline.appendChild(item);
    }

    counter.textContent =
        `Event ${model.history.length}`;

    timeline.scrollTop = 0;
}


function renderSender() {
    document.getElementById("senderBase").textContent =
        model.sender.base;

    document.getElementById("senderNext").textContent =
        model.sender.nextSequence;

    /*
     * Match the existing HTML:
     * id="senderWindowSize"
     */
    document.getElementById("senderWindowSize").textContent =
        model.sender.windowSize;

    document.getElementById("senderTimer").textContent =
        model.sender.timerSequence === null
            ? "—"
            : model.sender.timerSequence;

    const container =
        document.getElementById("senderSegments");

    container.innerHTML = "";

    for (const sequence of sequences) {
        const packet = getPacket(sequence);

        const cell =
            document.createElement("div");

        cell.className = "segment";

        /*
         * Show the current sliding window.
         */
        if (
            sequence >= model.sender.base &&
            sequence < windowEnd()
        ) {
            cell.classList.add("window");
        }

        if (packet.acknowledged) {
            cell.classList.add("acked");

        } else if (packet.lost) {
            cell.classList.add("lost");

        } else if (packet.inFlight) {
            cell.classList.add("in-flight");

        } else if (packet.sendCount === 0) {
            cell.classList.add("unsent");
        }

        cell.textContent = sequence;

        container.appendChild(cell);
    }
}


function renderReceiver() {
    document.getElementById("receiverExpected").textContent =
        model.receiver.nextExpected;

    document.getElementById("receiverAck").textContent =
        model.receiver.lastAck === null
            ? "—"
            : model.receiver.lastAck;

    const container =
        document.getElementById("receiverSegments");

    container.innerHTML = "";

    for (const sequence of sequences) {
        const cell =
            document.createElement("div");

        cell.className = "segment";

        if (
            model.receiver.received.has(sequence)
        ) {
            cell.classList.add("received");

        } else if (
            sequence ===
            model.receiver.nextExpected
        ) {
            /*
             * The receiver knows this is the next
             * segment it is waiting for.
             *
             * It does NOT know that the segment
             * has been lost.
             */
            cell.classList.add("expected");

        } else {
            cell.classList.add("unsent");
        }

        cell.textContent = sequence;

        container.appendChild(cell);
    }
}


document
    .getElementById("stepButton")
    .addEventListener("click", step);

document
    .getElementById("resetButton")
    .addEventListener("click", reset);


render();

