import { Request, Response } from 'express'
import { renderIndex } from '../views/index'

export class ViewHandler {
    renderHome(req: Request, res: Response): void {
        res.send(renderIndex(req, res))
    }
}