import excelFileIcon from '../../assets/excel-file.svg';
import pdfFileIcon from '../../assets/pdf-file.svg';

interface DocumentIconProps {
  className?: string;
}

export const ExcelIcon: React.FC<DocumentIconProps> = ({
  className = 'h-10 w-10',
}) => (
  <img
    alt=""
    aria-hidden="true"
    className={`${className} document-format-icon document-format-icon--xlsx flex-shrink-0`}
    src={excelFileIcon}
  />
);

export const PDFIcon: React.FC<DocumentIconProps> = ({
  className = 'h-10 w-10',
}) => (
  <img
    alt=""
    aria-hidden="true"
    className={`${className} document-format-icon document-format-icon--pdf flex-shrink-0`}
    src={pdfFileIcon}
  />
);
