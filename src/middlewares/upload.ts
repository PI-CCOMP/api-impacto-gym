import multer from 'multer'
import { Request, Response, NextFunction } from 'express'

const MAX_PDF_MB = 10
const MAX_IMG_MB = 5
const MAX_EXERCISE_IMAGE_MB = 10
const MAX_EXERCISE_VIDEO_MB = 100

const storage = multer.memoryStorage()

/** Upload de laudo médico — somente PDF, máx 10 MB */
export const uploadLaudo = multer({
  storage,
  limits: { fileSize: MAX_PDF_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true)
    } else {
      cb(new Error('Apenas arquivos PDF são aceitos.'))
    }
  },
}).single('arquivo')

/** Upload de foto de perfil — jpeg/png/webp, máx 5 MB */
export const uploadFoto = multer({
  storage,
  limits: { fileSize: MAX_IMG_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Apenas imagens JPEG, PNG ou WEBP são aceitas.'))
    }
  },
}).single('foto')

/** Upload de mídia de exercício — validação do conteúdo real no controller. */
export function uploadMidiaExercicio(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const maxFileSize =
    req.params.tipo === 'video'
      ? MAX_EXERCISE_VIDEO_MB * 1024 * 1024
      : MAX_EXERCISE_IMAGE_MB * 1024 * 1024
  multer({
    storage,
    limits: { fileSize: maxFileSize, files: 1 },
  }).single('arquivo')(req, res, (error: unknown) => {
    if (error) {
      handleMulterError(error, req, res, next)
      return
    }
    next()
  })
}

/** Wrapper para tratar erros do multer de forma padronizada */
export function handleMulterError(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ erro: err.message, codigo: 'UPLOAD_INVALIDO' })
    return
  }
  if (err instanceof Error) {
    res.status(400).json({ erro: err.message, codigo: 'UPLOAD_INVALIDO' })
    return
  }
  next(err)
}
