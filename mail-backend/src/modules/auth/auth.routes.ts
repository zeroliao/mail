import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { AuthService } from "./auth.service";

const bodySchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  const authService = new AuthService();

  fastify.post("/auth/login", {
    schema: {
      tags: ["auth"],
      body: {
        type: "object",
        required: ["username", "password"],
        properties: {
          username: { type: "string" },
          password: { type: "string" }
        }
      },
      response: {
        200: {
          type: "object",
          properties: {
            token: { type: "string" }
          }
        }
      }
    }
  }, async (request) => {
    const body = bodySchema.parse(request.body);
    return authService.login(body.username, body.password, fastify.jwt.sign.bind(fastify.jwt));
  });
};
