import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

export async function verifyAuth(request: Request | NextRequest) {
    try {
        const token = request.headers.get('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return null;
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret') as {
            userId: string;
            email: string;
        };

        return decoded.userId;
    } catch (error) {
        return null;
    }
}
