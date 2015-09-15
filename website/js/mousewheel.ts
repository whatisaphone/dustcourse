// this is a trimmed down (who cares about IE6) version of code from
// https://developer.mozilla.org/en-US/docs/Web/Events/wheel

// detect available wheel event
var eventName = "onwheel" in document.createElement("div") ? "wheel" : // Modern browsers support "wheel"
                document.onmousewheel !== undefined ? "mousewheel" : // Webkit and IE support at least "mousewheel"
                "DOMMouseScroll"; // let's assume that remaining browsers are older Firefox

export function addWheelListener( elem: Element, callback: (e: WheelEvent) => void, useCapture?: boolean) {
    elem.addEventListener(eventName, eventName === "wheel" ? callback : function (originalEvent: any) {
        // create a normalized event object
        var event = <WheelEvent>{
            // keep a ref to the original event object
            //originalEvent: originalEvent,
            target: originalEvent.target,
            type: "wheel",
            deltaMode: 1,
            deltaX: 0,
            deltaZ: 0,
            preventDefault: function() { originalEvent.preventDefault(); },
        };

        // calculate deltaY (and deltaX) according to the event
        if ( eventName == "mousewheel" ) {
            event.deltaY = - 1/40 * originalEvent.wheelDelta;
            // Webkit also support wheelDeltaX
            originalEvent.wheelDeltaX && ( event.deltaX = - 1/40 * originalEvent.wheelDeltaX );
        } else {
            event.deltaY = originalEvent.detail;
        }

        // it's time to fire the callback
        return callback(event);
    }, useCapture || false );
}
