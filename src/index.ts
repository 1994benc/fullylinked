import { Disposer } from "./common/disposer/Disposer";
import {
  FullyLinkedData,
  InternalFullyLinkedData,
} from "./common/data/FullyLinkedData";
import { FullyLinkedOptions } from "./common/options/FullyLinkedOptions";
import { InternalNode } from "./common/item/node/types/Node";
import { Edge } from "./common/item/edge/types/Edge";
import { Node } from "./common/item/node/types/Node";
import { setupCanvasZoomAndPan } from "./common/item/canvas/functions/setupCanvasZoomAndPan";
import { CanvasZoomLevelMaintainer } from "./common/item/canvas/stateMaintainers/CanvasZoomLevelMaintainer";
import { createSingleEdge } from "./common/item/edge/functions/createSingleEdge";
import {
  createSingleNode,
  CreateSingleNodeParams,
} from "./common/item/node/functions/createSingleNode";
import { CreateNewEdgeStateMaintainer } from "./common/item/edge/stateMaintainers/CreateNewEdgeStateMaintainer";
import { setNodeLinkAnchors } from "./common/item/node/functions/setNodeLinkAnchors";
import { FullyLinkedEventEnum } from "./common/event/FullyLinkedEventEnum";
import { addDisposableEventListener } from "./common/event/addEventListener";
import { FullyLinkedEvent } from "./common/event/FullyLinkedEvent";
import { UpdateDataMode } from "./common/data/UpdateDataMode";
const edgePlaceholderId = "placeholder-edge";

export class FullyLinked<NodeType, EdgeType> {
  private _container: HTMLElement | null;
  private _options: FullyLinkedOptions | null;
  private _disposer: Disposer;
  private _internalSVGElement: SVGSVGElement | undefined;
  private _nodeMapById: Map<string, InternalNode<NodeType>> = new Map();
  private _edgeMapById: Map<string, Edge<EdgeType>> = new Map();
  /** key is a nodeId and values are edges that are linked to the node */
  private _edgeListMapByNodeId: Map<string, Edge<EdgeType>[]> = new Map();
  private _innerContainer: HTMLDivElement | undefined;
  private _zoomLevelMaintainer: CanvasZoomLevelMaintainer =
    new CanvasZoomLevelMaintainer();
  private _createNewEdgeStateMaintainer = new CreateNewEdgeStateMaintainer();

  public destroyed: boolean = false;

  constructor(options: FullyLinkedOptions) {
    this._disposer = new Disposer();
    this._options = options;
    this._container = options.container;
    this._disposer.add({
      dispose: () => {
        this._options = null;
        if (this._container) this._container.innerHTML = "";
      },
    });
  }

  public setData(data: FullyLinkedData<NodeType, EdgeType>): void {
    // Clear existing data
    this._nodeMapById.clear();
    this._edgeMapById.clear();
    this._edgeListMapByNodeId.clear();

    const internalData: InternalFullyLinkedData<NodeType, EdgeType> = {
      ...data,
    };
    for (const node of internalData.nodes) {
      setNodeLinkAnchors(node);
      this._nodeMapById.set(node.id, node);
    }

    for (const edge of internalData.edges) {
      if (!this._nodeMapById.get(edge.source) || !this._nodeMapById.get(edge.target)) {
        // Target or source node does not exist. Skip this edge and continue without throwing an error.
        continue;
      }
      this._edgeMapById.set(edge.id, edge);
      if (!this._edgeListMapByNodeId.has(edge.source)) {
        this._edgeListMapByNodeId.set(edge.source, [edge]);
      } else {
        this._edgeListMapByNodeId.get(edge.source)?.push(edge);
      }
      if (!this._edgeListMapByNodeId.has(edge.target)) {
        this._edgeListMapByNodeId.set(edge.target, [edge]);
      } else {
        this._edgeListMapByNodeId.get(edge.target)?.push(edge);
      }
    }
  }

  /** Initialises and renders a FullyLinked graph */
  public render(): void {
    if (!this._container) {
      throw new Error("Container is not set or is undefined");
    }

    // clear all existing content
    this._container.innerHTML = "";

    this.destroyed = false;

    this._zoomLevelMaintainer.reset();

    this._innerContainer = document.createElement("div");
    this._innerContainer.style.width = "100%";
    this._innerContainer.style.height = "100%";
    this._innerContainer.style.position = "relative";

    this._container.appendChild(this._innerContainer);
    this._internalSVGElement = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    );
    this._internalSVGElement.classList.add(
      "fully-linked-svg-" + this._options?.id
    );
    this._internalSVGElement.style.position = "absolute";
    this._internalSVGElement.style.top = "0";
    this._internalSVGElement.style.left = "0";
    this._internalSVGElement.setAttribute("width", "100%");
    this._internalSVGElement.setAttribute("height", "100%");
    this._internalSVGElement.setAttribute("overflow", "visible");
    this._innerContainer.appendChild(this._internalSVGElement);
    this._disposer.add({
      dispose: () => {
        this._internalSVGElement?.remove();
      },
    });

    this.createNodesAndSetNodeMapById();

    this.createEdges();

    setupCanvasZoomAndPan(
      this._zoomLevelMaintainer,
      this._innerContainer,
      this._container
    );
  }

  public addOrReplaceNode(node: Node<NodeType>): void {
    if (this.destroyed) {
      throw new Error("FullyLinked is destroyed");
    }
    if (this._nodeMapById.has(node.id)) {
      console.log("Node already exists - replacing it");
    }
    this._nodeMapById.set(node.id, node);

    if (
      !this._innerContainer ||
      !this._internalSVGElement ||
      !this._container
    ) {
      throw new Error("Cannot add a node because FullyLinked is not rendered");
    }

    if (!this._options) {
      throw new Error("FullyLinkedOptions is not set");
    }

    const existingNodeElement = this.getNodeElement(node.id);
    if (existingNodeElement) {
      existingNodeElement.remove();
    }

    const createNodeParams: CreateSingleNodeParams<NodeType, EdgeType> = {
      node,
      innerContainer: this._innerContainer,
      internalSVGElement: this._internalSVGElement,
      container: this._container,
      options: this._options,
      nodeMapById: this._nodeMapById,
      edgeMapById: this._edgeMapById,
      edgeListMapByNodeId: this._edgeListMapByNodeId,
      canvasZoomLevelMaintainer: this._zoomLevelMaintainer,
      createNewEdgeStateMaintainer: this._createNewEdgeStateMaintainer,
      edgePlaceholderId: edgePlaceholderId,
      disposer: this._disposer,
    };
    createSingleNode(createNodeParams);
  }

  public addOrReplaceEdge = (edge: Edge<EdgeType>) => {
    createSingleEdge({
      edge,
      internalSVGElement: this._internalSVGElement as SVGSVGElement,
      nodesMapById: this._nodeMapById,
      edgesMapById: this._edgeMapById,
      edgesMapByNodeId: this._edgeListMapByNodeId,
    });
  };

  /** Checks that an edge exists. This checks the actual element in the DOM not just in the data */
  public hasEdgeElement(id: string): boolean {
    const edge = this.getEdgeElement(id);
    return !!edge;
  }

  /** Checks that a node exists. This checks the actual element in the DOM not just in the data */
  public hasNodeElement(id: string): boolean {
    const node = this.getNodeElement(id);
    return !!node;
  }

  public getEdgeElement(id: string) {
    if (!this._internalSVGElement) {
      throw new Error("_internalSVGElement is not available");
    }
    return this._internalSVGElement.querySelector(
      `path[data-edge-id="${id}"]`
    ) as SVGElement;
  }

  public getNodeElement(id: string) {
    return this._container?.querySelector(
      `[data-node-id="${id}"]`
    ) as SVGElement;
  }

  public on<SpecificFullyLinkedEventInfo>(
    eventName: FullyLinkedEventEnum,
    callback: (
      e: FullyLinkedEvent<NodeType, EdgeType, SpecificFullyLinkedEventInfo>
    ) => void
  ): void {
    if (!this._container) {
      throw new Error("Container is not set or is undefined");
    }
    addDisposableEventListener(
      this._container,
      eventName,
      ((e: CustomEvent) => {
        callback({
          item: e.detail.item as Node<NodeType> | Edge<EdgeType>,
          itemType: e.detail.type as "node" | "edge",
          info: e.detail.info as SpecificFullyLinkedEventInfo,
        });
      }) as EventListener,
      this._disposer
    );
  }

  public destroy(): void {
    this._disposer.dispose();
    this.destroyed = true;
  }

  // SECTION private methods:
  private createEdges() {
    for (const [, edge] of this._edgeMapById.entries()) {
      if (!this._internalSVGElement) {
        throw new Error("SVG is not set");
      }
      createSingleEdge({
        edge,
        internalSVGElement: this._internalSVGElement,
        nodesMapById: this._nodeMapById,
        edgesMapById: this._edgeMapById,
        edgesMapByNodeId: this._edgeListMapByNodeId,
      });
    }
  }

  private createNodesAndSetNodeMapById() {
    for (const [, node] of this._nodeMapById.entries()) {
      this._nodeMapById.set(node.id, node);
      if (!this._innerContainer) {
        throw new Error("Inner container is not set");
      }
      if (!this._options) {
        throw new Error("Options are not set");
      }
      createSingleNode({
        node,
        innerContainer: this._innerContainer,
        container: this._container as HTMLElement,
        options: this._options,
        createNewEdgeStateMaintainer: this._createNewEdgeStateMaintainer,
        canvasZoomLevelMaintainer: this._zoomLevelMaintainer,
        internalSVGElement: this._internalSVGElement as SVGSVGElement,
        edgePlaceholderId,
        disposer: this._disposer,
        nodeMapById: this._nodeMapById,
        edgeMapById: this._edgeMapById,
        edgeListMapByNodeId: this._edgeListMapByNodeId,
      });
    }
  }
}
