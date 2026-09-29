/**
 * Canonical Template Engine (CTE) - Release R06
 * AffineMatrix
 *
 * Provides deterministic 2D affine transformation matrix operations
 * conforming to PDF Standard (ISO 32000-1, Section 8.3.3).
 *
 * Coordinate transformation:
 *   x' = a * x + c * y + e
 *   y' = b * x + d * y + f
 */

export class AffineMatrix {
  constructor(
    public readonly a: number = 1,
    public readonly b: number = 0,
    public readonly c: number = 0,
    public readonly d: number = 1,
    public readonly e: number = 0,
    public readonly f: number = 0
  ) {}

  /**
   * Returns a standard identity matrix (no-op).
   */
  static identity(): AffineMatrix {
    return new AffineMatrix(1, 0, 0, 1, 0, 0);
  }

  /**
   * Constructs a pure translation matrix.
   */
  static translation(tx: number, ty: number): AffineMatrix {
    return new AffineMatrix(1, 0, 0, 1, tx, ty);
  }

  /**
   * Constructs a pure scaling matrix.
   */
  static scaling(sx: number, sy: number): AffineMatrix {
    return new AffineMatrix(sx, 0, 0, sy, 0, 0);
  }

  /**
   * Constructs a rotation matrix around origin (0, 0).
   * @param angleRad Angle in radians (counter-clockwise)
   */
  static rotation(angleRad: number): AffineMatrix {
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    return new AffineMatrix(cosA, sinA, -sinA, cosA, 0, 0);
  }

  /**
   * Constructs a rotation matrix around an arbitrary pivot point (cx, cy).
   * @param angleRad Angle in radians (counter-clockwise)
   */
  static rotationAround(angleRad: number, cx: number, cy: number): AffineMatrix {
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    const e = cx * (1 - cosA) + cy * sinA;
    const f = cy * (1 - cosA) - cx * sinA;
    return new AffineMatrix(cosA, sinA, -sinA, cosA, e, f);
  }

  /**
   * Constructs a shear/keystone perspective rectification matrix.
   */
  static shear(shx: number, shy: number): AffineMatrix {
    return new AffineMatrix(1, shy, shx, 1, 0, 0);
  }

  /**
   * Multiplies this matrix by another (this * other).
   * If transformation T1 is applied first, then T2, the combined matrix is T1.multiply(T2).
   */
  multiply(m: AffineMatrix): AffineMatrix {
    return new AffineMatrix(
      this.a * m.a + this.b * m.c,
      this.a * m.b + this.b * m.d,
      this.c * m.a + this.d * m.c,
      this.c * m.b + this.d * m.d,
      this.e * m.a + this.f * m.c + m.e,
      this.e * m.b + this.f * m.d + m.f
    );
  }

  /**
   * Transforms a 2D point (x, y).
   */
  transformPoint(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.round((this.a * x + this.c * y + this.e) * 1000) / 1000,
      y: Math.round((this.b * x + this.d * y + this.f) * 1000) / 1000,
    };
  }

  /**
   * Computes the mathematical inverse of this affine transformation.
   */
  inverse(): AffineMatrix {
    const det = this.a * this.d - this.b * this.c;
    if (Math.abs(det) < 1e-12) {
      return AffineMatrix.identity();
    }
    const invDet = 1 / det;
    return new AffineMatrix(
      this.d * invDet,
      -this.b * invDet,
      -this.c * invDet,
      this.a * invDet,
      (this.c * this.f - this.d * this.e) * invDet,
      (this.b * this.e - this.a * this.f) * invDet
    );
  }

  /**
   * Returns array representation [a, b, c, d, e, f] for PDF cm operator.
   */
  toArray(): [number, number, number, number, number, number] {
    return [this.a, this.b, this.c, this.d, this.e, this.f];
  }

  /**
   * Returns true if this matrix is identity (no transformation).
   */
  isIdentity(tolerance = 1e-6): boolean {
    return (
      Math.abs(this.a - 1) < tolerance &&
      Math.abs(this.b) < tolerance &&
      Math.abs(this.c) < tolerance &&
      Math.abs(this.d - 1) < tolerance &&
      Math.abs(this.e) < tolerance &&
      Math.abs(this.f) < tolerance
    );
  }
}
