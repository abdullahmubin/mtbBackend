/**
 * Basic OpenAPI seed definitions. You can expand these over time
 * by adding more blocks in this folder or directly in controllers.
 */

/**
 * @openapi
 * tags:
 *   - name: Health
 *     description: Service health endpoints
 *   - name: Auth
 *     description: Authentication endpoints
 *   - name: Receipts
 *     description: Receipt CRUD endpoints
 */

/**
 * @openapi
 * /api/health:
 *   get:
 *     tags: [Health]
 *     summary: Health status
 *     description: Returns service, database, and memory status.
 *     responses:
 *       200:
 *         description: OK
 *       503:
 *         description: Unhealthy
 */

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @openapi
 * /api/receipts:
 *   get:
 *     tags: [Receipts]
 *     security:
 *       - bearerAuth: []
 *     summary: List receipts
 *     responses:
 *       200:
 *         description: Array of receipts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Receipt'
 *   post:
 *     tags: [Receipts]
 *     security:
 *       - bearerAuth: []
 *     summary: Create receipt
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Receipt'
 *     responses:
 *       201:
 *         description: Created
 */

/**
 * @openapi
 * /api/receipts/{id}:
 *   get:
 *     tags: [Receipts]
 *     security:
 *       - bearerAuth: []
 *     summary: Get a receipt by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: A receipt
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Receipt'
 *       404:
 *         description: Not found
 */
