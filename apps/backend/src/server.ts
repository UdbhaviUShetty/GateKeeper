import express, { Request, Response } from "express";
import { randomUUID } from "crypto";

/**
 * The "dummy backend" GateKeeper proxies to. It intentionally knows nothing
 * about rate limiting, API keys, or the gateway — that's the point. A real
 * backend service shouldn't need to be aware it's sitting behind a gateway;
 * the gateway's job is to be a transparent layer in front of it.
 */
const app = express();
app.use(express.json());

// Log the request ID the gateway propagated, to demonstrate that one ID can
// be traced across both services' logs.
app.use((req: Request, _res: Response, next) => {
  const requestId = req.header("X-Request-ID") ?? "none";
  console.log(JSON.stringify({ service: "backend", requestId, method: req.method, path: req.path }));
  next();
});

app.get("/api/hello", (_req: Request, res: Response) => {
  res.json({
    message: "Hello from backend",
    timestamp: new Date().toISOString(),
    requestId: randomUUID(),
  });
});

app.get("/api/users", (_req: Request, res: Response) => {
  res.json({
    users: [
      { id: 1, name: "Ada Lovelace" },
      { id: 2, name: "Grace Hopper" },
      { id: 3, name: "Margaret Hamilton" },
    ],
  });
});

app.get("/api/products", (_req: Request, res: Response) => {
  res.json({
    products: [
      { id: "p1", name: "Widget", price: 9.99 },
      { id: "p2", name: "Gadget", price: 19.99 },
    ],
  });
});

app.post("/api/echo", (req: Request, res: Response) => {
  res.json({ youSent: req.body });
});

const PORT = parseInt(process.env.PORT ?? "4000", 10);
app.listen(PORT, () => {
  console.log(JSON.stringify({ service: "backend", message: `listening on ${PORT}` }));
});
