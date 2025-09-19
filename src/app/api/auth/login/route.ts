import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import * as bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Set Node.js runtime to make bcrypt work in Vercel
export const runtime = 'nodejs';

function corsHeaders() {
    const origin = process.env.NEXT_PUBLIC_APP_ORIGIN || '*';
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    } as Record<string, string>;
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: corsHeaders(),
    });
}

export async function POST(req: NextRequest) {
    try {
        const { email, password } = await req.json();

        // Find user
        const user = await prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            return NextResponse.json(
                { success: false, message: 'Invalid credentials' },
                { status: 401 }
            );
        }

        // Verify password
    const isValidPassword = bcrypt.compareSync(password, user.password);
        if (!isValidPassword) {
            return NextResponse.json(
                { success: false, message: 'Invalid credentials' },
                { status: 401 }
            );
        }

        // Generate JWT
        const token = jwt.sign(
            { userId: user.id, email: user.email },
            process.env.JWT_SECRET || 'default-secret',
            { expiresIn: '24h' }
        );

        return NextResponse.json(
          {
              success: true,
              user: { id: user.id, email: user.email },
              token
          },
          { headers: corsHeaders() }
        );
    } catch (error: any) {
        console.error('Login error:', error);
        return NextResponse.json(
            { success: false, message: error.message || 'Server error' },
            { status: 500, headers: corsHeaders() }
        );
    }
}