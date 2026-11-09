import { useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { auth } from './firebase.ts'

// user: undefined = 確認中，null = 未ログイン
export function useAuth() {
  const [user, setUser] = useState<User | null | undefined>(undefined)

  useEffect(() => onAuthStateChanged(auth, setUser), [])

  const signIn = () => signInWithPopup(auth, new GoogleAuthProvider())
  const logOut = () => signOut(auth)

  return { user, signIn, logOut }
}
