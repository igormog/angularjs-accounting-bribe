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


      /**
       * The dragend event is triggered when the element was dropped or when the drag
       * operation was aborted (e.g. hit escape button). Depending on the executed action
       * we will invoke the callbacks specified with the dnd-moved or dnd-copied attribute.
       */
      element.on('dragend', function(event) {
        event = event.originalEvent || event;

        // Invoke callbacks. Usually we would use event.dataTransfer.dropEffect to determine
        // the used effect, but Chrome has not implemented that field correctly. On Windows
        // it always sets it to 'none', while Chrome on Linux sometimes sets it to something
        // else when it's supposed to send 'none' (drag operation aborted).
        var dropEffect = dndDropEffectWorkaround.dropEffect;
        scope.$apply(function() {
          switch (dropEffect) {
            case "move":
              $parse(attr.dndMoved)(scope, {event: event});
              break;
            case "copy":
              $parse(attr.dndCopied)(scope, {event: event});
              break;
            case "none":
              $parse(attr.dndCanceled)(scope, {event: event});
              break;
          }
          $parse(attr.dndDragend)(scope, {event: event, dropEffect: dropEffect});
        });

        // Clean up
        element.removeClass("dndDragging");
        $timeout(function() { element.removeClass("dndDraggingSource"); }, 0);
        dndDragTypeWorkaround.isDragging = false;
        event.stopPropagation();
      });




      /**
       * When the element is clicked we invoke the callback function
       * specified with the dnd-selected attribute.
       */
      element.on('click', function(event) {
        if (!attr.dndSelected) return;

        event = event.originalEvent || event;
        scope.$apply(function() {
          $parse(attr.dndSelected)(scope, {event: event});
        });

        // Prevent triggering dndSelected in parant elements.
        event.stopPropagation();
      });

      /**
       * Workaround to make element draggable in IE9
       */
      element.on('selectstart', function() {
        if (this.dragDrop) this.dragDrop();
      });
    };
  }])


  /**
   * Use the dnd-list attribute to make your list element a dropzone. Usually you will add a single
   * li element as child with the ng-repeat directive. If you don't do that, we will not be able to
   * position the dropped element correctly. If you want your list to be sortable, also add the
   * dnd-draggable directive to your li element(s). Both the dnd-list and it's direct children must
   * have position: relative CSS style, otherwise the positioning algorithm will not be able to
   * determine the correct placeholder position in all browsers.
   */
  .directive('dndList', ['$parse', '$timeout', 'dndDropEffectWorkaround', 'dndDragTypeWorkaround',
                 function($parse,   $timeout,   dndDropEffectWorkaround,   dndDragTypeWorkaround) {
    return function(scope, element, attr) {
      // While an element is dragged over the list, this placeholder element is inserted
      // at the location where the element would be inserted after dropping
      var placeholder = getPlaceholderElement();
      var placeholderNode = placeholder[0];
      var listNode = element[0];
      placeholder.remove();

      var horizontal = attr.dndHorizontalList && scope.$eval(attr.dndHorizontalList);
      var externalSources = attr.dndExternalSources && scope.$eval(attr.dndExternalSources);

      /**
       * The dragover event is triggered "every few hundred milliseconds" while an element
       * is being dragged over our list, or over an child element.
       */
      element.on('dragover', function(event) {
        event = event.originalEvent || event;

        if (!isDropAllowed(event)) return true;

        // First of all, make sure that the placeholder is shown
        // This is especially important if the list is empty
        if (placeholderNode.parentNode != listNode) {
          element.append(placeholder);
        }

        if (event.target !== listNode) {
          // Try to find the node direct directly below the list node.
          var listItemNode = event.target;
          while (listItemNode.parentNode !== listNode && listItemNode.parentNode) {
            listItemNode = listItemNode.parentNode;
          }

          if (listItemNode.parentNode === listNode && listItemNode !== placeholderNode) {
            // If the mouse pointer is in the upper half of the child element,
            // we place it before the child element, otherwise below it.
            if (isMouseInFirstHalf(event, listItemNode)) {
              listNode.insertBefore(placeholderNode, listItemNode);
            } else {
              listNode.insertBefore(placeholderNode, listItemNode.nextSibling);
            }
          }
        } else {
          // This branch is reached when we are dragging directly over the list element.
          // Usually we wouldn't need to do anything here, but the IE does not fire it's
          // events for the child element, only for the list directly. Therefore we repeat
          // the positioning algorithm for IE here.
          if (isMouseInFirstHalf(event, placeholderNode, true)) {
            // Check if we should move the placeholder element one spot towards the top.
            // Note that display none elements will have offsetTop and offsetHeight set to
            // zero, therefore we need a special check for them.
            while (placeholderNode.previousElementSibling
                 && (isMouseInFirstHalf(event, placeholderNode.previousElementSibling, true)
                 || placeholderNode.previousElementSibling.offsetHeight === 0)) {
              listNode.insertBefore(placeholderNode, placeholderNode.previousElementSibling);
            }
          } else {
            // Check if we should move the placeholder element one spot towards the bottom
            while (placeholderNode.nextElementSibling &&
                 !isMouseInFirstHalf(event, placeholderNode.nextElementSibling, true)) {
              listNode.insertBefore(placeholderNode,
                  placeholderNode.nextElementSibling.nextElementSibling);
            }
          }
        }

        // At this point we invoke the callback, which still can disallow the drop.
        // We can't do this earlier because we want to pass the index of the placeholder.
        if (attr.dndDragover && !invokeCallback(attr.dndDragover, event, getPlaceholderIndex())) {
          return stopDragover();
        }

        element.addClass("dndDragover");
        event.preventDefault();
        event.stopPropagation();
        return false;
      });





      /**
       * When the element is dropped, we use the position of the placeholder element as the
       * position where we insert the transferred data. This assumes that the list has exactly
       * one child element per array element.
       */
      element.on('drop', function(event) {
        event = event.originalEvent || event;

        if (!isDropAllowed(event)) return true;

        // The default behavior in Firefox is to interpret the dropped element as URL and
        // forward to it. We want to prevent that even if our drop is aborted.
        event.preventDefault();

        // Unserialize the data that was serialized in dragstart. According to the HTML5 specs,
        // the "Text" drag type will be converted to text/plain, but IE does not do that.
        var data = event.dataTransfer.getData("Text") || event.dataTransfer.getData("text/plain");
        var transferredObject;
        try {
          transferredObject = JSON.parse(data);
        } catch(e) {
          return stopDragover();
        }

        // Invoke the callback, which can transform the transferredObject and even abort the drop.
        var index = getPlaceholderIndex();
        if (attr.dndDrop) {
          transferredObject = invokeCallback(attr.dndDrop, event, index, transferredObject);
          if (!transferredObject) {
            return stopDragover();
          }
        }

        // Retrieve the JSON array and insert the transferred object into it.
        var targetArray = scope.$eval(attr.dndList);
        scope.$apply(function() {
          targetArray.splice(index, 0, transferredObject);
        });
        invokeCallback(attr.dndInserted, event, index, transferredObject);

        // In Chrome on Windows the dropEffect will always be none...
        // We have to determine the actual effect manually from the allowed effects
        if (event.dataTransfer.dropEffect === "none") {
          if (event.dataTransfer.effectAllowed === "copy" ||
              event.dataTransfer.effectAllowed === "move") {
            dndDropEffectWorkaround.dropEffect = event.dataTransfer.effectAllowed;
          } else {
            dndDropEffectWorkaround.dropEffect = event.ctrlKey ? "copy" : "move";
          }
        } else {
          dndDropEffectWorkaround.dropEffect = event.dataTransfer.dropEffect;
        }

        // Clean up
        stopDragover();
        event.stopPropagation();
        return false;
      });

      /**
       * We have to remove the placeholder when the element is no longer dragged over our list. The
       * problem is that the dragleave event is not only fired when the element leaves our list,
       * but also when it leaves a child element -- so practically it's fired all the time. As a
       * workaround we wait a few milliseconds and then check if the dndDragover class was added
       * again. If it is there, dragover must have been called in the meantime, i.e. the element
       * is still dragging over the list. If you know a better way of doing this, please tell me!
       */
      element.on('dragleave', function(event) {
        event = event.originalEvent || event;

        element.removeClass("dndDragover");
        $timeout(function() {
          if (!element.hasClass("dndDragover")) {
            placeholder.remove();
          }
        }, 100);
      });


      /**
       * Checks whether the mouse pointer is in the first half of the given target element.
       *
       * In Chrome we can just use offsetY, but in Firefox we have to use layerY, which only
       * works if the child element has position relative. In IE the events are only triggered
       * on the listNode instead of the listNodeItem, therefore the mouse positions are
       * relative to the parent element of targetNode.
       */
      function isMouseInFirstHalf(event, targetNode, relativeToParent) {
        var mousePointer = horizontal ? (event.offsetX || event.layerX)
                                      : (event.offsetY || event.layerY);
        var targetSize = horizontal ? targetNode.offsetWidth : targetNode.offsetHeight;
        var targetPosition = horizontal ? targetNode.offsetLeft : targetNode.offsetTop;
        targetPosition = relativeToParent ? targetPosition : 0;
        return mousePointer < targetPosition + targetSize / 2;
      }


      /**
       * Tries to find a child element that has the dndPlaceholder class set. If none was found, a
       * new li element is created.
       */
      function getPlaceholderElement() {
        var placeholder;
        angular.forEach(element.children(), function(childNode) {
          var child = angular.element(childNode);
          if (child.hasClass('dndPlaceholder')) {
            placeholder = child;
          }
        });
        return placeholder || angular.element("<li class='dndPlaceholder'></li>");
      }


      /**
       * We use the position of the placeholder node to determine at which position of the array the
       * object needs to be inserted
       */
      function getPlaceholderIndex() {
        return Array.prototype.indexOf.call(listNode.children, placeholderNode);
      }


      /**
       * Checks various conditions that must be fulfilled for a drop to be allowed
       */
      function isDropAllowed(event) {
        // Disallow drop from external source unless it's allowed explicitly.
        if (!dndDragTypeWorkaround.isDragging && !externalSources) return false;

        // Check mimetype. Usually we would use a custom drag type instead of Text, but IE doesn't
        // support that.
        if (!hasTextMimetype(event.dataTransfer.types)) return false;

        // Now check the dnd-allowed-types against the type of the incoming element. For drops from
        // external sources we don't know the type, so it will need to be checked via dnd-drop.
        if (attr.dndAllowedTypes && dndDragTypeWorkaround.isDragging) {
          var allowed = scope.$eval(attr.dndAllowedTypes);
          if (angular.isArray(allowed) && allowed.indexOf(dndDragTypeWorkaround.dragType) === -1) {
            return false;
          }
        }

        // Check whether droping is disabled completely
        if (attr.dndDisableIf && scope.$eval(attr.dndDisableIf)) return false;

        return true;
      }

      /**
       * Small helper function that cleans up if we aborted a drop.
       */
      function stopDragover() {
        placeholder.remove();
        element.removeClass("dndDragover");
        return true;
      }


     /**
       * Invokes a callback with some interesting parameters and returns the callbacks return value.
       */
      function invokeCallback(expression, event, index, item) {
        return $parse(expression)(scope, {
          event: event,
          index: index,
          item: item || undefined,
          external: !dndDragTypeWorkaround.isDragging,
          type: dndDragTypeWorkaround.isDragging ? dndDragTypeWorkaround.dragType : undefined
        });
      }

      /**
       * Check if the dataTransfer object contains a drag type that we can handle. In old versions
       * of IE the types collection will not even be there, so we just assume a drop is possible.
       */
      function hasTextMimetype(types) {
        if (!types) return true;
        for (var i = 0; i < types.length; i++) {
          if (types[i] === "Text" || types[i] === "text/plain") return true;
        }

        return false;
      }
    };
  }])


  /**
   * Use the dnd-nodrag attribute inside of dnd-draggable elements to prevent them from starting
   * drag operations. This is especially useful if you want to use input elements inside of
   * dnd-draggable elements or create specific handle elements.
   */
  .directive('dndNodrag', function() {
    return function(scope, element, attr) {
      // Set as draggable so that we can cancel the events explicitly
      element.attr("draggable", "true");

      /**
       * Since the element is draggable, the browser's default operation is to drag it on dragstart.
       * We will prevent that and also stop the event from bubbling up.
       */
      element.on('dragstart', function(event) {
        event = event.originalEvent || event;

        // If a child element already reacted to dragstart and set a dataTransfer object, we will
        // allow that. For example, this is the case for user selections inside of input elements.
        if (!(event.dataTransfer.types && event.dataTransfer.types.length)) {
          event.preventDefault();
        }
        event.stopPropagation();
      });

    };
  })


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

