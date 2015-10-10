/**
 * angular-drag-and-drop v1.0
 */
angular.module('dndLists', [])

 .directive('dndDraggable', ['$parse', '$timeout', 'dndDropEffectWorkaround', 'dndDragTypeWorkaround',
                      function($parse,   $timeout,   dndDropEffectWorkaround,   dndDragTypeWorkaround) {
    return function(scope, element, attr) {
      // Set the HTML5 draggable attribute on the element
      element.attr("draggable", "true");

      // If the dnd-disable-if attribute is set, we have to watch that
      if (attr.dndDisableIf) {
        scope.$watch(attr.dndDisableIf, function(disabled) {
          element.attr("draggable", !disabled);
        });
      }

      /**
       * When the drag operation is started we have to prepare the dataTransfer object,
       * which is the primary way we communicate with the target element
       */
      element.on('dragstart', function(event) {
        event = event.originalEvent || event;

        // Serialize the data associated with this element. IE only supports the Text drag type
        event.dataTransfer.setData("Text", angular.toJson(scope.$eval(attr.dndDraggable)));

        // Only allow actions specified in dnd-effect-allowed attribute
        event.dataTransfer.effectAllowed = attr.dndEffectAllowed || "move";

        // Add CSS classes. See documentation above
        element.addClass("dndDragging");
        $timeout(function() { element.addClass("dndDraggingSource"); }, 0);

        // Workarounds for stupid browsers, see description below
        dndDropEffectWorkaround.dropEffect = "none";
        dndDragTypeWorkaround.isDragging = true;

        // Save type of item in global state. Usually, this would go into the dataTransfer
        // typename, but we have to use "Text" there to support IE
        dndDragTypeWorkaround.dragType = attr.dndType ? scope.$eval(attr.dndType) : undefined;

        // Invoke callback
        $parse(attr.dndDragstart)(scope, {event: event});

        event.stopPropagation();
      });